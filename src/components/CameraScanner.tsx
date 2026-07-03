import { useEffect, useRef, useState, useCallback } from 'react';
import { detectPaperCorners, type Point } from '../lib/imagePreprocess';

interface CameraScannerProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraScanner({ onCapture, onClose }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<number | null>(null);
  const prevCornersRef = useRef<Point[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [paperDetected, setPaperDetected] = useState(false);

  // Start camera with proper FPS constraints
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }

        // Check torch support
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities?.() as
            | Record<string, unknown>
            | undefined;
          if (capabilities && 'torch' in capabilities) {
            setTorchSupported(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : 'Camera access denied';
          setError(
            msg.includes('NotAllowed') || msg.includes('Permission')
              ? 'Camera permission denied. Please allow camera access in your browser settings.'
              : `Could not open camera: ${msg}`,
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Paper detection loop (~10 FPS)
  useEffect(() => {
    if (!ready) return;

    let lastTime = 0;
    const INTERVAL = 100; // ms between detections

    function detect(timestamp: number) {
      if (timestamp - lastTime >= INTERVAL) {
        lastTime = timestamp;

        const video = videoRef.current;
        const overlay = overlayRef.current;
        if (!video || !overlay) {
          detectionRef.current = requestAnimationFrame(detect);
          return;
        }

        // Match overlay to video display size
        const rect = video.getBoundingClientRect();
        overlay.width = rect.width;
        overlay.height = rect.height;

        const corners = detectPaperCorners(video, rect.width, rect.height);

        // Smooth corners with exponential moving average
        let smoothed = corners;
        if (corners && prevCornersRef.current) {
          const alpha = 0.5;
          smoothed = corners.map((c, i) => ({
            x: alpha * c.x + (1 - alpha) * prevCornersRef.current![i].x,
            y: alpha * c.y + (1 - alpha) * prevCornersRef.current![i].y,
          }));
        }
        prevCornersRef.current = smoothed;
        setPaperDetected(!!smoothed);

        // Draw overlay
        const ctx = overlay.getContext('2d')!;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        drawOverlay(ctx, overlay.width, overlay.height, smoothed);
      }

      // Stop the detection loop once the camera stream has been released (after capture/close),
      // otherwise it keeps running against a dead <video> element.
      if (streamRef.current) {
        detectionRef.current = requestAnimationFrame(detect);
      }
    }

    detectionRef.current = requestAnimationFrame(detect);

    return () => {
      if (detectionRef.current) cancelAnimationFrame(detectionRef.current);
    };
  }, [ready]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newState = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: newState } as MediaTrackConstraintSet],
      });
      setTorchOn(newState);
    } catch {
      // Torch not supported on this device
    }
  }, [torchOn]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `scan_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          // Stop camera before returning
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          onCapture(file);
        }
      },
      'image/jpeg',
      0.92,
    );
  }, [onCapture]);

  const handleClose = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera feed */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Paper detection overlay canvas */}
        <canvas
          ref={overlayRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* Status text */}
        {ready && (
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-20 text-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium drop-shadow-lg ${
                paperDetected
                  ? 'bg-green-600/80 text-white'
                  : 'bg-black/60 text-white/90'
              }`}
            >
              {paperDetected
                ? '✓ Paper detected — tap to capture'
                : 'Align invoice within the frame'}
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="rounded-lg bg-white p-6 text-center">
              <p className="mb-4 text-sm text-red-600">{error}</p>
              <button
                onClick={handleClose}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white"
              >
                Go Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between bg-black px-6 py-4 safe-area-bottom">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white"
          aria-label="Close camera"
        >
          ✕
        </button>

        {/* Capture button */}
        <button
          onClick={captureFrame}
          disabled={!ready}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-90 disabled:opacity-40"
          aria-label="Capture photo"
        >
          <div
            className={`h-12 w-12 rounded-full transition-colors ${
              paperDetected ? 'bg-green-400' : 'bg-white'
            }`}
          />
        </button>

        {/* Torch toggle */}
        {torchSupported ? (
          <button
            onClick={toggleTorch}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${
              torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'
            }`}
            aria-label={torchOn ? 'Turn off flash' : 'Turn on flash'}
          >
            ⚡
          </button>
        ) : (
          <div className="h-12 w-12" />
        )}
      </div>
    </div>
  );
}

/**
 * Draw the overlay: dark mask with cutout for paper or guide rectangle.
 */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  corners: Point[] | null,
) {
  // Dark semi-transparent layer
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, w, h);

  // Cut out the detected paper / guide region
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'black';
  ctx.beginPath();

  if (corners && corners.length === 4) {
    // Paper detected — cut out the polygon
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  } else {
    // No paper — show guide rectangle (3:4 aspect)
    const rw = w * 0.85;
    const rh = Math.min(rw * (4 / 3), h * 0.70);
    const rx = (w - rw) / 2;
    const ry = (h - rh) / 2;
    ctx.roundRect(rx, ry, rw, rh, 12);
  }

  ctx.closePath();
  ctx.fill();

  // Switch back to normal compositing
  ctx.globalCompositeOperation = 'source-over';

  // Draw border around cutout
  ctx.beginPath();
  if (corners && corners.length === 4) {
    // Green border around detected paper
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.stroke();

    // Corner dots
    ctx.fillStyle = '#22c55e';
    for (const c of corners) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Dashed guide rectangle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    const rw = w * 0.85;
    const rh = Math.min(rw * (4 / 3), h * 0.70);
    const rx = (w - rw) / 2;
    const ry = (h - rh) / 2;
    ctx.roundRect(rx, ry, rw, rh, 12);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
