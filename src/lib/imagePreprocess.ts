/**
 * Client-side image preprocessing for OCR quality assurance.
 *
 * - Paper detection: edge-based document detection in camera feed
 * - Blur detection: Laplacian variance
 * - Preprocessing: grayscale + auto-levels + contrast enhancement
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCV.js (window.cv) and its Mat objects ship no TypeScript types */

export interface Point {
  x: number;
  y: number;
}

export interface PreprocessResult {
  /** Preprocessed image blob (grayscale, enhanced) */
  processedBlob: Blob;
  /** Data URL for preview display */
  previewUrl: string;
  /** Laplacian variance — higher = sharper */
  blurScore: number;
  /** true if image is too blurry for reliable OCR */
  isBlurry: boolean;
  width: number;
  height: number;
  /** True if OpenCV successfully dewarped the image */
  dewarped: boolean;
}

declare global {
  interface Window {
    cv: any;
  }
}

// ── Constants ──────────────────────────────────────────────

const BLUR_THRESHOLD = 80;
const DETECT_WIDTH = 240;

// ── Public API ─────────────────────────────────────────────

/**
 * Detect paper/document corners in the current video frame.
 * Returns 4 corners [TL, TR, BR, BL] in display coordinates, or null.
 */
export function detectPaperCorners(
  video: HTMLVideoElement,
  displayWidth: number,
  displayHeight: number,
): Point[] | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const scale = DETECT_WIDTH / video.videoWidth;
  const dw = DETECT_WIDTH;
  const dh = Math.round(video.videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, dw, dh);

  const imageData = ctx.getImageData(0, 0, dw, dh);
  
  let corners: Point[] | null = null;
  // Use OpenCV if available for much better detection
  if (window.cv && window.cv.Mat) {
    corners = findPaperCornersOpenCV(canvas);
  }
  
  // Fallback to basic math if OpenCV isn't loaded or failed
  if (!corners) {
    corners = findPaperCorners(imageData, dw, dh);
  }

  if (!corners) return null;

  // Scale from detection → video → display coordinates
  const invScale = 1 / scale;
  const videoCorners = corners.map((c) => ({
    x: c.x * invScale,
    y: c.y * invScale,
  }));

  return mapVideoToDisplay(
    videoCorners,
    video.videoWidth,
    video.videoHeight,
    displayWidth,
    displayHeight,
  );
}

/**
 * Full preprocessing pipeline for a captured image.
 * Converts to grayscale, enhances contrast, detects blur.
 */
export async function preprocessCapturedImage(
  file: File,
): Promise<PreprocessResult> {
  let { canvas, ctx, width, height } = await loadImageToCanvas(file);
  let dewarped = false;

  // Attempt OpenCV Dewarping first!
  try {
    if (window.cv && window.cv.Mat) {
      const resultCanvas = await dewarpWithOpenCV(canvas);
      if (resultCanvas) {
        canvas = resultCanvas;
        ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        width = canvas.width;
        height = canvas.height;
        dewarped = true;
      }
    }
  } catch (err) {
    console.error('OpenCV dewarping failed:', err);
    // Fallback to original image if OpenCV crashes
  }

  // Compute blur score on (possibly dewarped) image
  const origData = ctx.getImageData(0, 0, width, height);
  const gray = toGrayscale(origData.data, width, height);
  const blurScore = computeBlurScore(gray, width, height);
  const isBlurry = blurScore < BLUR_THRESHOLD;

  // Apply OCR preprocessing
  enhanceForOCR(ctx, width, height);

  const previewUrl = canvas.toDataURL('image/jpeg', 0.9);
  const processedBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);

  return { processedBlob, previewUrl, blurScore, isBlurry, width, height, dewarped };
}

// ── OpenCV Document Dewarping ──────────────────────────────

async function dewarpWithOpenCV(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  const cv = window.cv;
  if (!cv || !cv.imread || !cv.Mat) return null;

  let src: any = null;
  let dst: any = null;
  let contours: any = null;
  let hierarchy: any = null;
  let approxContour: any = null;
  let srcTri: any = null;
  let dstTri: any = null;
  let M: any = null;
  let warped: any = null;
  let dsize: any = null;

  try {
    src = cv.imread(canvas);
    dst = new cv.Mat();
    
    // 1. Convert to grayscale & blur to reduce noise
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(dst, dst, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // 2. Canny Edge Detection
    cv.Canny(dst, dst, 75, 200);

    // 3. Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 4. Find the largest 4-point contour
    let maxArea = 0;
    let maxContourIndex = -1;
    approxContour = new cv.Mat();

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > 1000) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        
        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          maxContourIndex = i;
          approx.copyTo(approxContour);
        }
        approx.delete();
      }
      cnt.delete();
    }

    // 5. If we found a valid 4-point contour covering at least 15% of the image
    const imgArea = src.cols * src.rows;
    if (maxContourIndex !== -1 && maxArea > imgArea * 0.15) {
      // Sort points: [tl, tr, br, bl]
      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: approxContour.data32S[i * 2], y: approxContour.data32S[i * 2 + 1] });
      }

      // Sort by sum/diff to find corners
      pts.sort((a, b) => a.y - b.y);
      const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
      const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
      const tl = top[0], tr = top[1], bl = bottom[0], br = bottom[1];

      // Compute width/height of new image
      const widthA = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
      const widthB = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
      const maxWidth = Math.max(Math.floor(widthA), Math.floor(widthB));

      const heightA = Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2));
      const heightB = Math.sqrt(Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2));
      const maxHeight = Math.max(Math.floor(heightA), Math.floor(heightB));

      // Define source and destination points
      srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth - 1, 0, maxWidth - 1, maxHeight - 1, 0, maxHeight - 1]);

      // Apply Perspective Transform
      M = cv.getPerspectiveTransform(srcTri, dstTri);
      warped = new cv.Mat();
      dsize = new cv.Size(maxWidth, maxHeight);
      cv.warpPerspective(src, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

      // Convert back to canvas
      const outCanvas = document.createElement('canvas');
      outCanvas.width = maxWidth;
      outCanvas.height = maxHeight;
      cv.imshow(outCanvas, warped);

      return outCanvas;
    }

    return null;
  } catch (err) {
    console.error("OpenCV Dewarping error:", err);
    return null;
  } finally {
    // Cleanup OpenCV mats safely
    if (src) src.delete();
    if (dst) dst.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (approxContour) approxContour.delete();
    if (srcTri) srcTri.delete();
    if (dstTri) dstTri.delete();
    if (M) M.delete();
    if (warped) warped.delete();
  }
}

// ── Paper Detection Internals ──────────────────────────────

function findPaperCornersOpenCV(canvas: HTMLCanvasElement): Point[] | null {
  const cv = window.cv;
  const src = cv.imread(canvas);
  const dst = new cv.Mat();
  
  try {
    // 1. Convert to grayscale & blur
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(dst, dst, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // 2. Canny Edge Detection
    cv.Canny(dst, dst, 75, 200);

    // 3. Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let maxContourIndex = -1;
    const approxContour = new cv.Mat();

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > 1000) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        
        if (approx.rows === 4 && area > maxArea) {
          maxArea = area;
          maxContourIndex = i;
          approx.copyTo(approxContour);
        }
        approx.delete();
      }
      cnt.delete();
    }

    const imgArea = src.cols * src.rows;
    let result: Point[] | null = null;

    // Must be at least 15% of the frame
    if (maxContourIndex !== -1 && maxArea > imgArea * 0.15) {
      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: approxContour.data32S[i * 2], y: approxContour.data32S[i * 2 + 1] });
      }

      // Sort points: [tl, tr, br, bl]
      pts.sort((a, b) => a.y - b.y);
      const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
      const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
      
      // Expected format is [TL, TR, BR, BL]
      result = [top[0], top[1], bottom[1], bottom[0]];
    }

    // Cleanup OpenCV mats
    contours.delete(); hierarchy.delete(); approxContour.delete();
    return result;

  } catch (err) {
    console.error("OpenCV paper detection error:", err);
    return null;
  } finally {
    src.delete(); 
    dst.delete();
  }
}

function findPaperCorners(
  imageData: ImageData,
  w: number,
  h: number,
): Point[] | null {
  const { data } = imageData;

  // 1. Grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] =
      0.299 * data[i * 4] +
      0.587 * data[i * 4 + 1] +
      0.114 * data[i * 4 + 2];
  }

  // 2. Gaussian blur
  const blurred = gaussianBlur3(gray, w, h);

  // 3. Sobel edge detection
  const edgeMag = new Float32Array(w * h);
  const edgeDirX = new Float32Array(w * h);
  const edgeDirY = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -blurred[(y - 1) * w + (x - 1)] +
        blurred[(y - 1) * w + (x + 1)] -
        2 * blurred[y * w + (x - 1)] +
        2 * blurred[y * w + (x + 1)] -
        blurred[(y + 1) * w + (x - 1)] +
        blurred[(y + 1) * w + (x + 1)];
      const gy =
        -blurred[(y - 1) * w + (x - 1)] -
        2 * blurred[(y - 1) * w + x] -
        blurred[(y - 1) * w + (x + 1)] +
        blurred[(y + 1) * w + (x - 1)] +
        2 * blurred[(y + 1) * w + x] +
        blurred[(y + 1) * w + (x + 1)];
      edgeMag[idx] = Math.sqrt(gx * gx + gy * gy);
      edgeDirX[idx] = gx;
      edgeDirY[idx] = gy;
    }
  }

  // 4. Edge threshold (75th percentile of non-zero magnitudes)
  const nonZero = [];
  for (let i = 0; i < w * h; i++) {
    if (edgeMag[i] > 0) nonZero.push(edgeMag[i]);
  }
  if (nonZero.length === 0) return null;
  nonZero.sort((a, b) => a - b);
  const edgeThreshold = nonZero[Math.floor(nonZero.length * 0.75)];
  if (edgeThreshold < 5) return null;

  // 5. Scan from 4 sides to find paper boundary edges
  const margin = Math.floor(Math.min(w, h) * 0.03);
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));

  const topPts = scanEdge(edgeMag, edgeDirX, edgeDirY, w, h, 'top', margin, step, edgeThreshold);
  const bottomPts = scanEdge(edgeMag, edgeDirX, edgeDirY, w, h, 'bottom', margin, step, edgeThreshold);
  const leftPts = scanEdge(edgeMag, edgeDirX, edgeDirY, w, h, 'left', margin, step, edgeThreshold);
  const rightPts = scanEdge(edgeMag, edgeDirX, edgeDirY, w, h, 'right', margin, step, edgeThreshold);

  if (
    topPts.length < 3 ||
    bottomPts.length < 3 ||
    leftPts.length < 3 ||
    rightPts.length < 3
  ) {
    return null;
  }

  // 6. Fit lines
  const topLine = fitLine(topPts, 'horizontal');
  const bottomLine = fitLine(bottomPts, 'horizontal');
  const leftLine = fitLine(leftPts, 'vertical');
  const rightLine = fitLine(rightPts, 'vertical');

  if (!topLine || !bottomLine || !leftLine || !rightLine) return null;

  // 7. Intersect
  const tl = lineIntersection(topLine, leftLine);
  const tr = lineIntersection(topLine, rightLine);
  const br = lineIntersection(bottomLine, rightLine);
  const bl = lineIntersection(bottomLine, leftLine);

  if (!tl || !tr || !br || !bl) return null;

  // 8. Validate bounds
  const pad = -Math.min(w, h) * 0.15;
  for (const pt of [tl, tr, br, bl]) {
    if (pt.x < pad || pt.x > w - pad || pt.y < pad || pt.y > h - pad)
      return null;
  }

  // 9. Validate area (15-95% of frame)
  const area = shoelaceArea([tl, tr, br, bl]);
  const ratio = area / (w * h);
  if (ratio < 0.15 || ratio > 0.95) return null;

  return [tl, tr, br, bl];
}

type ScanDirection = 'top' | 'bottom' | 'left' | 'right';

function scanEdge(
  mag: Float32Array,
  dirX: Float32Array,
  dirY: Float32Array,
  w: number,
  h: number,
  direction: ScanDirection,
  margin: number,
  step: number,
  threshold: number,
): Point[] {
  const pts: Point[] = [];
  const isHorizontal = direction === 'top' || direction === 'bottom';

  if (isHorizontal) {
    // Scan columns, looking for horizontal edges (|gy| > |gx|)
    for (let x = margin; x < w - margin; x += step) {
      const [start, end, inc] =
        direction === 'top'
          ? [margin, Math.floor(h * 0.6), 1]
          : [h - 1 - margin, Math.floor(h * 0.4), -1];
      for (let y = start; direction === 'top' ? y < end : y > end; y += inc) {
        const idx = y * w + x;
        if (
          mag[idx] > threshold &&
          Math.abs(dirY[idx]) > Math.abs(dirX[idx]) * 0.7
        ) {
          pts.push({ x, y });
          break;
        }
      }
    }
  } else {
    // Scan rows, looking for vertical edges (|gx| > |gy|)
    for (let y = margin; y < h - margin; y += step) {
      const [start, end, inc] =
        direction === 'left'
          ? [margin, Math.floor(w * 0.6), 1]
          : [w - 1 - margin, Math.floor(w * 0.4), -1];
      for (let x = start; direction === 'left' ? x < end : x > end; x += inc) {
        const idx = y * w + x;
        if (
          mag[idx] > threshold &&
          Math.abs(dirX[idx]) > Math.abs(dirY[idx]) * 0.7
        ) {
          pts.push({ x, y });
          break;
        }
      }
    }
  }

  return pts;
}

// ── Line Fitting ───────────────────────────────────────────

interface Line {
  a: number;
  b: number;
  c: number;
} // ax + by + c = 0

function fitLine(pts: Point[], orient: 'horizontal' | 'vertical'): Line | null {
  if (pts.length < 2) return null;

  if (orient === 'horizontal') {
    // Fit y = mx + b (horizontal-ish line)
    const n = pts.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
      sxy += p.x * p.y;
      sxx += p.x * p.x;
    }
    const denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-6) {
      // Vertical set of points — shouldn't happen for horizontal edges
      const avgY = sy / n;
      return { a: 0, b: -1, c: avgY };
    }
    const m = (n * sxy - sx * sy) / denom;
    const b = (sy - m * sx) / n;
    // y = mx + b → mx - y + b = 0
    return { a: m, b: -1, c: b };
  } else {
    // Fit x = my + b (vertical-ish line)
    const n = pts.length;
    let sx = 0, sy = 0, sxy = 0, syy = 0;
    for (const p of pts) {
      sx += p.x;
      sy += p.y;
      sxy += p.x * p.y;
      syy += p.y * p.y;
    }
    const denom = n * syy - sy * sy;
    if (Math.abs(denom) < 1e-6) {
      const avgX = sx / n;
      return { a: -1, b: 0, c: avgX };
    }
    const m = (n * sxy - sx * sy) / denom;
    const b = (sx - m * sy) / n;
    // x = my + b → -x + my + b = 0
    return { a: -1, b: m, c: b };
  }
}

function lineIntersection(l1: Line, l2: Line): Point | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (l1.b * l2.c - l2.b * l1.c) / det,
    y: (l2.a * l1.c - l1.a * l2.c) / det,
  };
}

function shoelaceArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

// ── Coordinate Mapping ─────────────────────────────────────

function mapVideoToDisplay(
  points: Point[],
  videoW: number,
  videoH: number,
  displayW: number,
  displayH: number,
): Point[] {
  const videoAspect = videoW / videoH;
  const displayAspect = displayW / displayH;

  let srcX: number, srcY: number, srcW: number, srcH: number;
  if (videoAspect > displayAspect) {
    srcH = videoH;
    srcW = srcH * displayAspect;
    srcX = (videoW - srcW) / 2;
    srcY = 0;
  } else {
    srcW = videoW;
    srcH = srcW / displayAspect;
    srcX = 0;
    srcY = (videoH - srcH) / 2;
  }

  return points.map((p) => ({
    x: ((p.x - srcX) / srcW) * displayW,
    y: ((p.y - srcY) / srcH) * displayH,
  }));
}

// ── Blur Detection ─────────────────────────────────────────

function computeBlurScore(
  gray: Float32Array,
  w: number,
  h: number,
): number {
  // Laplacian variance — kernel: [0,1,0; 1,-4,1; 0,1,0]
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  // Downsample for speed if image is large
  const step = Math.max(1, Math.floor(Math.min(w, h) / 500));

  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const idx = y * w + x;
      const lap =
        gray[idx - w] +
        gray[idx + w] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

// ── Image Enhancement ──────────────────────────────────────

function enhanceForOCR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  // 1. Convert to grayscale
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const g = Math.round(
      0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2],
    );
    data[off] = g;
    data[off + 1] = g;
    data[off + 2] = g;
  }

  // 2. Compute histogram for auto-levels
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) hist[data[i * 4]]++;

  const total = w * h;
  const lowTarget = Math.floor(total * 0.02);
  const highTarget = Math.floor(total * 0.98);

  let cum = 0;
  let lowVal = 0;
  let highVal = 255;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= lowTarget && lowVal === 0) lowVal = i;
    if (cum >= highTarget && highVal === 255) {
      highVal = i;
      break;
    }
  }

  // 3. Build LUT: auto-levels + S-curve contrast
  const lut = new Uint8Array(256);
  const range = Math.max(highVal - lowVal, 1);

  for (let i = 0; i < 256; i++) {
    // Auto-levels stretch
    let v = (i - lowVal) / range;
    v = Math.max(0, Math.min(1, v));

    // S-curve contrast: push darks darker, lights lighter
    // Using a sigmoid-like curve with steepness 1.8
    if (v < 0.5) {
      v = 0.5 * Math.pow(2 * v, 1.8);
    } else {
      v = 1 - 0.5 * Math.pow(2 * (1 - v), 1.8);
    }

    lut[i] = Math.round(v * 255);
  }

  // 4. Apply LUT
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    const val = lut[data[off]];
    data[off] = val;
    data[off + 1] = val;
    data[off + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
}

// ── Helpers ────────────────────────────────────────────────

function toGrayscale(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] =
      0.299 * data[i * 4] +
      0.587 * data[i * 4 + 1] +
      0.114 * data[i * 4 + 2];
  }
  return gray;
}

function gaussianBlur3(
  src: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const dst = new Float32Array(w * h);
  // Kernel: [1,2,1; 2,4,2; 1,2,1] / 16
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      dst[y * w + x] =
        (src[(y - 1) * w + (x - 1)] +
          2 * src[(y - 1) * w + x] +
          src[(y - 1) * w + (x + 1)] +
          2 * src[y * w + (x - 1)] +
          4 * src[y * w + x] +
          2 * src[y * w + (x + 1)] +
          src[(y + 1) * w + (x - 1)] +
          2 * src[(y + 1) * w + x] +
          src[(y + 1) * w + (x + 1)]) /
        16;
    }
  }
  // Copy border pixels
  for (let x = 0; x < w; x++) {
    dst[x] = src[x];
    dst[(h - 1) * w + x] = src[(h - 1) * w + x];
  }
  for (let y = 0; y < h; y++) {
    dst[y * w] = src[y * w];
    dst[y * w + (w - 1)] = src[y * w + (w - 1)];
  }
  return dst;
}

function loadImageToCanvas(
  file: File,
): Promise<{
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve({
        canvas,
        ctx,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      type,
      quality,
    );
  });
}
