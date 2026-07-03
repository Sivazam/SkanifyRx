import { useState, useEffect } from 'react';
import {
  preprocessCapturedImage,
  type PreprocessResult,
} from '../lib/imagePreprocess';

interface ImagePreviewProps {
  /** Raw captured files to preprocess and preview */
  files: File[];
  /** Called with processed files when user approves */
  onApprove: (processedFiles: File[]) => void;
  /** Called when user wants to retake */
  onRetake: () => void;
}

export function ImagePreview({ files, onApprove, onRetake }: ImagePreviewProps) {
  const [results, setResults] = useState<PreprocessResult[]>([]);
  const [rotations, setRotations] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function process() {
      setLoading(true);
      const processed: PreprocessResult[] = [];
      for (const file of files) {
        if (cancelled) return;
        processed.push(await preprocessCapturedImage(file));
      }
      if (!cancelled) {
        setResults(processed);
        setRotations(processed.map(() => 0));
        setLoading(false);
      }
    }

    process();
    return () => {
      cancelled = true;
    };
  }, [files]);

  const handleApprove = async () => {
    setApproving(true);
    const finalFiles: File[] = [];

    for (let i = 0; i < results.length; i++) {
      const rot = rotations[i] || 0;
      if (rot === 0) {
        finalFiles.push(
          new File([results[i].processedBlob], files[i].name || `processed_${i}.jpg`, {
            type: 'image/jpeg',
          })
        );
      } else {
        // Physically apply rotation via canvas
        try {
          const img = new Image();
          img.src = results[i].previewUrl;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          const canvas = document.createElement('canvas');
          if (rot === 90 || rot === 270) {
            canvas.width = img.height;
            canvas.height = img.width;
          } else {
            canvas.width = img.width;
            canvas.height = img.height;
          }

          const ctx = canvas.getContext('2d')!;
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);

          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
          if (blob) {
            finalFiles.push(
              new File([blob], files[i].name || `processed_${i}.jpg`, { type: 'image/jpeg' })
            );
          } else {
            throw new Error('Canvas toBlob failed');
          }
        } catch (err) {
          console.error('Rotation failed for file', i, err);
          // Fallback to unrotated if it fails
          finalFiles.push(
            new File([results[i].processedBlob], files[i].name || `processed_${i}.jpg`, {
              type: 'image/jpeg',
            })
          );
        }
      }
    }

    onApprove(finalFiles);
  };

  const handleRotate = () => {
    setRotations((prev) => {
      const newRots = [...prev];
      newRots[currentIdx] = (newRots[currentIdx] + 90) % 360;
      return newRots;
    });
  };

  const anyBlurry = results.some((r) => r.isBlurry);
  const current = results[currentIdx];

  if (loading || approving) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-white" />
        <p className="text-sm text-white/80">
          {approving ? 'Finalizing image...' : 'Preprocessing image...'}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Preview</h2>
        {results.length > 1 && (
          <span className="text-xs text-gray-400">
            {currentIdx + 1} / {results.length}
          </span>
        )}
        <button
          onClick={onRetake}
          className="text-sm font-medium text-gray-300 hover:text-white"
        >
          Cancel
        </button>
      </div>

      {/* Image Preview */}
      <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center">
        {current && (
          <img
            src={current.previewUrl}
            alt="Preprocessed preview"
            className="max-h-full max-w-full object-contain transition-transform duration-300"
            style={{ transform: `rotate(${rotations[currentIdx] || 0}deg)` }}
          />
        )}

        {/* Multi-image navigation */}
        {results.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  i === currentIdx
                    ? 'bg-white'
                    : r.isBlurry
                      ? 'bg-red-400/60'
                      : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quality Info */}
      <div className="bg-gray-800 px-4 py-3">
        {current && (
          <div className="mb-3 flex items-center gap-3">
            {/* Blur status */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                current.isBlurry
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-green-500/20 text-green-300'
              }`}
            >
              <span>{current.isBlurry ? '⚠' : '✓'}</span>
              <span>
                {current.isBlurry ? 'Image is blurry' : 'Image is sharp'}
              </span>
            </div>

            {/* Resolution */}
            <span className="text-xs text-gray-500">
              {current.width} × {current.height}
            </span>

            {/* Dewarped Status */}
            {current.dewarped && (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                ✨ Auto-Flattened
              </span>
            )}
          </div>
        )}

        {/* Blur warning */}
        {anyBlurry && (
          <p className="mb-3 text-xs text-amber-300">
            Blurry images may produce inaccurate OCR results. Consider retaking.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={handleRotate}
            className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-600 flex items-center justify-center gap-2"
          >
            <span>↻</span> Rotate 90°
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRetake}
            className="flex-1 rounded-lg border border-gray-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            Retake
          </button>
          <button
            onClick={handleApprove}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors ${
              anyBlurry
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            {anyBlurry ? 'Use Anyway' : 'Looks Good'}
          </button>
        </div>
      </div>
    </div>
  );
}
