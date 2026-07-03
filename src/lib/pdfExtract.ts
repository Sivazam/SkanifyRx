import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Use local worker bundled by Vite instead of CDN which can break
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Guardrails so a large or many-page PDF can't exhaust browser memory / hang the tab.
const MAX_PAGES = 20;            // Hard cap on pages rendered from a single PDF
const MAX_LONG_EDGE_PX = 2200;   // Downscale so the longest side never exceeds this (~200 DPI on A4)
const JPEG_QUALITY = 0.85;       // Slightly lower than 0.9 — negligible OCR impact, much smaller files

/**
 * Converts a native PDF File into an array of high-quality JPEG Image Files.
 * This ensures the heavy lifting of PDF rendering is distributed to the client's browser,
 * removing all C++ dependencies from the Cloud Backend and providing native UI previews.
 *
 * Pages beyond MAX_PAGES are skipped (returned count may be less than the PDF's page count).
 */
export async function convertPdfToImages(pdfFile: File): Promise<File[]> {
  console.log(`[pdfExtract] Starting conversion for file: ${pdfFile.name}`);
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    console.log(`[pdfExtract] Array buffer loaded: ${arrayBuffer.byteLength} bytes`);
    
    console.log(`[pdfExtract] Loading PDF document with pdfjs...`);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const numPages = pdf.numPages;
    console.log(`[pdfExtract] Document loaded successfully. Total pages: ${numPages}`);
    const pagesToRender = Math.min(numPages, MAX_PAGES);
    if (numPages > MAX_PAGES) {
      console.warn(`[pdfExtract] PDF has ${numPages} pages; rendering only the first ${MAX_PAGES}.`);
    }
    const imageFiles: File[] = [];

    for (let i = 1; i <= pagesToRender; i++) {
      console.log(`[pdfExtract] Processing page ${i} / ${pagesToRender}...`);
      const page = await pdf.getPage(i);

      // Start from a high-quality 2x render (~288 DPI), then clamp so the longest edge
      // never exceeds MAX_LONG_EDGE_PX. This keeps big/A3 PDFs from allocating huge canvases.
      const baseViewport = page.getViewport({ scale: 2.0 });
      const longEdge = Math.max(baseViewport.width, baseViewport.height);
      const scale = longEdge > MAX_LONG_EDGE_PX ? (2.0 * MAX_LONG_EDGE_PX) / longEdge : 2.0;
      const viewport = page.getViewport({ scale });
      console.log(`[pdfExtract] Page ${i} viewport: ${Math.round(viewport.width)}x${Math.round(viewport.height)} (scale ${scale.toFixed(2)})`);

      // Create an offscreen canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error(`[pdfExtract] Failed to get 2D context for page ${i}`);
        continue;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render page into the canvas context
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      } as any;

      console.log(`[pdfExtract] Rendering page ${i}...`);
      await page.render(renderContext).promise;
      console.log(`[pdfExtract] Page ${i} rendered.`);

      // Convert rendered canvas to a compressed JPEG
      console.log(`[pdfExtract] Converting canvas to Blob for page ${i}...`);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));

      // Free the canvas backing store immediately (important on mobile for multi-page PDFs)
      canvas.width = 0;
      canvas.height = 0;

      if (blob) {
        console.log(`[pdfExtract] Blob generated: ${blob.size} bytes`);
        const safeName = pdfFile.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9-]/g, '_');
        const fileName = `${safeName}_page_${i}.jpg`;
        const imageFile = new File([blob], fileName, { type: 'image/jpeg' });
        imageFiles.push(imageFile);
      } else {
        console.error(`[pdfExtract] Failed to generate Blob for page ${i}`);
      }
    }

    console.log(`[pdfExtract] Extraction complete. Returning ${imageFiles.length} images.`);
    return imageFiles;
  } catch (error) {
    console.error(`[pdfExtract] Fatal error during conversion:`, error);
    throw error;
  }
}
