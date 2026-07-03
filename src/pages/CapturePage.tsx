import { useState, useRef, useCallback } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { collection, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { db, storage, auth } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { savePendingUpload } from '../lib/offlineStore';
import { getApiUrl } from '../lib/api';

import { ImagePreview } from '../components/ImagePreview';
import type { VisionApiMode } from '../types';
import toast from 'react-hot-toast';

interface PageFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'pdf';
}

export function CapturePage() {
  const { user, userProfile } = useAuthContext();
  const isOnline = useOnlineStatus();
  const [pages, setPages] = useState<PageFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [zoomedPreview, setZoomedPreview] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | null, type: 'image' | 'pdf') => {
    if (!files || files.length === 0) return;
    
    // Copy synchronously because the input's value gets cleared immediately after this is called!
    const fileArray = Array.from(files);
    console.log(`[CapturePage] addFiles called with type: ${type}, files count: ${fileArray.length}`);

    if (type === 'pdf') {
      try {
        console.log('[CapturePage] Starting PDF extraction process...');
        setUploading(true);
        setUploadProgress('Extracting PDF pages...');
        
        console.log('[CapturePage] Importing pdfExtract module...');
        const { convertPdfToImages } = await import('../lib/pdfExtract');
        console.log('[CapturePage] pdfExtract module imported successfully.');
        
        const extractedImages: File[] = [];
        for (const file of fileArray) {
          console.log(`[CapturePage] Extracting pages from file: ${file.name} (${file.size} bytes)...`);
          const pages = await convertPdfToImages(file);
          console.log(`[CapturePage] Extracted ${pages.length} pages from ${file.name}`);
          extractedImages.push(...pages);
        }
        
        // PDFs are already perfectly flat digital documents.
        // We do NOT want to pass them to OpenCV ImagePreview (which tries to dewarp them and hangs).
        // Instead, add them directly to the final pages array!
        console.log(`[CapturePage] Total extracted images: ${extractedImages.length}. Adding to state...`);
        const newPages: PageFile[] = extractedImages.map((file) => ({
          id: crypto.randomUUID(),
          file,
          preview: URL.createObjectURL(file),
          type: 'pdf' as const,
        }));
        setPages((prev) => {
          console.log(`[CapturePage] Previous pages count: ${prev.length}, new pages count: ${newPages.length}`);
          return [...prev, ...newPages];
        });
        console.log('[CapturePage] PDF extraction finished successfully.');
      } catch (err) {
        console.error('[CapturePage] PDF Extraction Error:', err);
        alert(`Failed to parse the PDF document: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setUploading(false);
        setUploadProgress('');
      }
    } else {
      setPreviewFiles((prev) => [...prev, ...fileArray]);
    }
  }, []);


  const handlePreviewApprove = useCallback((processedFiles: File[]) => {
    const newPages: PageFile[] = processedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      type: 'image' as const,
    }));
    setPages((prev) => [...prev, ...newPages]);
    setPreviewFiles([]);
  }, []);

  const handlePreviewRetake = useCallback(() => {
    setPreviewFiles([]);
  }, []);

  const removePage = (id: string) => {
    setPages((prev) => {
      const page = prev.find((p) => p.id === id);
      if (page && page.type === 'image') {
        URL.revokeObjectURL(page.preview);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleUpload = async () => {
    if (!user?.pharmacyId || pages.length === 0) return;

    // ── OFFLINE MODE: save to IndexedDB ──
    if (!isOnline) {
      setUploading(true);
      const batchId = crypto.randomUUID();
      try {
        for (let i = 0; i < pages.length; i++) {
          setUploadProgress(`Saving page ${i + 1} offline...`);
          await savePendingUpload(
            user.pharmacyId,
            pages[i].file,
            pages[i].file.name,
            pages[i].type,
            batchId,
          );
        }
        setOfflineSaved(true);
        setPages([]);
        setUploadProgress('');
      } catch (err) {
        console.error('Offline save error:', err);
        alert('Failed to save offline. Please try again.');
      } finally {
        setUploading(false);
      }
      return;
    }
    
    if (!user?.pharmacyId) {
      toast.error('User not found. Please log in again.');
      return;
    }

    const pagesToUpload = [...pages];
    setPages([]);
    toast.success(`Sending ${pagesToUpload.length} page(s) for processing. You can scan another document now!`, { duration: 4000 });

    // Fire and forget background process
    (async () => {
      try {
        if (!user?.pharmacyId) return;
        
        // Create invoice document
        const invoicesRef = collection(db, 'pharmacies', user.pharmacyId, 'invoices');
        const invoiceDoc = doc(invoicesRef);
        const invoiceId = invoiceDoc.id;
        const imageUrls: string[] = [];

        // Upload each page
        for (let i = 0; i < pagesToUpload.length; i++) {
          const page = pagesToUpload[i];
          let fileToUpload = page.file;

          // PDF pages are already rendered to JPEGs by convertPdfToImages, so every page
          // reaching here is an image. Compress all of them before upload.
          if (fileToUpload.type.startsWith('image/')) {
            try {
              fileToUpload = await imageCompression(page.file, {
                maxSizeMB: 1,
                maxWidthOrHeight: 2400,
                useWebWorker: true,
              });
            } catch (compressErr) {
              // Compression is best-effort — fall back to the original file on failure.
              console.warn('Image compression failed, uploading original:', compressErr);
              fileToUpload = page.file;
            }
          }

          const timestamp = Date.now();
          const hash = Math.random().toString(36).substring(2, 8);
          // Everything uploaded is a JPEG now (camera images and rendered PDF pages alike).
          const ext = fileToUpload.type === 'application/pdf' ? 'pdf' : 'jpg';
          const storagePath = `pharmacies/${user.pharmacyId}/invoices/${invoiceId}/original_${timestamp}_${hash}.${ext}`;

          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, fileToUpload);
          imageUrls.push(storagePath);
        }

        // Fetch pharmacy settings for visionApiMode
        let visionApiMode: VisionApiMode = 'gemini_vision';
        let ocrProvider = 'vision';
        let intelProvider = 'gemini';
        let geminiModel = 'flash';
        let deepseekModel = 'deepseek-v4-pro';
        let zaiModel = 'glm-5.1';
        
        try {
          const pharmacyDoc = await getDoc(doc(db, 'pharmacies', user.pharmacyId));
          if (pharmacyDoc.exists()) {
            const s = pharmacyDoc.data()?.settings || {};
            visionApiMode = s.visionApiMode || 'gemini_vision';
            ocrProvider = s.ocrProvider || 'vision';
            intelProvider = s.intelligenceProvider || 'gemini';
            geminiModel = s.geminiModel || 'flash';
            deepseekModel = s.deepseekModel || 'deepseek-v4-pro';
            zaiModel = s.zaiModel || 'glm-5.1';
          }
        } catch {
          // Default to Vision + Gemini
        }

        // Create Firestore document
        await setDoc(invoiceDoc, {
          pharmacyId: user.pharmacyId,
          uploadedBy: user.uid,
          uploadedByName: userProfile?.displayName || user.email || 'Unknown User',
          supplierName: '',
          invoiceNumber: '',
          invoiceDate: '',
          imageUrls,
          status: 'uploading',
          visionApiMode, // legacy
          ocrProvider,
          intelligenceProvider: intelProvider,
          geminiModel,
          deepseekModel,
          zaiModel,
          processingError: null,
          totalAmount: null,
          totalItems: null,
          userFeedback: null,
          correctionRate: null,
          viewed: false, // Added viewed field for unread highlighting
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        // Call Cloud Function to start processing
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(getApiUrl('processInvoice'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            invoiceId,
            pharmacyId: user.pharmacyId,
            visionApiMode,
            ocrProvider,
            intelligenceProvider: intelProvider,
            geminiModel,
            deepseekModel,
            zaiModel,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          let errMsg = `Processing failed (HTTP ${response.status})`;
          try {
            const errBody = JSON.parse(errText);
            if (errBody.error) errMsg = errBody.error;
          } catch {
            if (errText) errMsg += `: ${errText.slice(0, 200)}`;
          }
          console.error('CF error:', response.status, errText);
          throw new Error(errMsg);
        }

        // Successfully queued! The Cloud Function handles the rest.
        // The user will be notified via GlobalNotificationListener when status changes to 'review'
      } catch (err) {
        console.error('Upload error:', err);
        toast.error(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      }
    })();
  };

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const outOfCredits = userProfile ? (!isAdmin && (userProfile.credits ?? 0) <= 0) : false;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900">Scan Invoice</h1>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <span className="mr-1 font-medium">📡 Offline</span> — You can still capture images. They'll upload automatically when you're back online.
        </div>
      )}

      {/* Offline Saved Confirmation */}
      {offlineSaved && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4 text-center">
          <div className="mb-1 text-2xl">✅</div>
          <p className="font-medium text-green-800">Saved for offline upload!</p>
          <p className="mt-1 text-sm text-green-600">
            Images will upload automatically when you go online.
          </p>
          <button
            onClick={() => setOfflineSaved(false)}
            className="mt-3 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            Capture Another
          </button>
        </div>
      )}

      {/* No Credits Banner */}
      {outOfCredits && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800 shadow-sm flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-900">Out of Credits</p>
            <p className="mt-1 text-red-700">You do not have enough credits to process new documents. Please contact your administrator to top up your account.</p>
          </div>
        </div>
      )}

      {/* Input Buttons */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">


        {/* Gallery */}
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={uploading || outOfCredits}
          className="flex items-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 p-5 text-left hover:border-zinc-500 hover:bg-zinc-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl">🖼️</span>
          <div>
            <p className="font-medium text-gray-900">Choose from Gallery</p>
            <p className="text-xs text-gray-500">Select saved photos</p>
          </div>
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading || outOfCredits}
          onChange={async (e) => { 
            const files = e.target.files;
            if (files && files.length > 0) {
              await addFiles(files, 'image');
            }
            e.target.value = ''; 
          }}
        />

        {/* PDF Upload */}
        <button
          onClick={() => pdfRef.current?.click()}
          disabled={uploading || outOfCredits}
          className="flex items-center gap-3 rounded-xl border-2 border-dashed border-zinc-300 p-5 text-left hover:border-zinc-500 hover:bg-zinc-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-2xl">📄</span>
          <div>
            <p className="font-medium text-gray-900">Upload PDF</p>
            <p className="text-xs text-gray-500">Digital invoice files</p>
          </div>
        </button>
        <input
          ref={pdfRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={uploading || outOfCredits}
          onChange={async (e) => { 
            const files = e.target.files;
            if (files && files.length > 0) {
              await addFiles(files, 'pdf');
            }
            e.target.value = ''; 
          }}
        />
      </div>

      {/* Page Previews */}
      {pages.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-gray-700">
            {pages.length} page{pages.length > 1 ? 's' : ''} added
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {pages.map((page, idx) => (
              <div key={page.id} className="group relative cursor-pointer" onClick={() => setZoomedPreview(page.preview)}>
                <img
                  src={page.preview}
                  alt={`Page ${idx + 1}`}
                  className="h-32 w-full rounded-lg border border-gray-200 object-cover hover:opacity-80 transition-opacity"
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                  {idx + 1} {page.type === 'pdf' ? '(PDF)' : ''}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removePage(page.id); }}
                  disabled={uploading}
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white group-hover:flex"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {pages.length > 0 && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-95"
        >
          {uploading ? uploadProgress || 'Uploading...' : isOnline ? `Upload & Process ${pages.length} Page${pages.length > 1 ? 's' : ''}` : `Save ${pages.length} Page${pages.length > 1 ? 's' : ''} Offline`}
        </button>
      )}

      {/* Live Scanner Overlay */}


      {/* Image Preview & Approval Overlay */}
      {previewFiles.length > 0 && !uploading && (
        <ImagePreview
          files={previewFiles}
          onApprove={handlePreviewApprove}
          onRetake={handlePreviewRetake}
        />
      )}

      {/* Zoomed Preview Overlay */}
      {zoomedPreview && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomedPreview(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-50 p-2"
            onClick={() => setZoomedPreview(null)}
          >
            <span className="text-4xl font-light">&times;</span>
          </button>
          <img 
            src={zoomedPreview} 
            alt="Zoomed preview" 
            className="max-h-[95vh] max-w-[95vw] object-contain cursor-zoom-out"
            onClick={(e) => {
              e.stopPropagation();
              setZoomedPreview(null);
            }} 
          />
        </div>
      )}

      {/* Removing full-screen Uploading overlay as it runs in the background now */}
    </div>
  );
}
