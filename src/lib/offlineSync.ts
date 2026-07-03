/**
 * Offline sync — auto-uploads pending captures when connectivity returns.
 */
import { ref, uploadBytes } from 'firebase/storage';
import { collection, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { db, storage, auth } from './firebase';
import { getApiUrl } from './api';
import {
  getPendingUploads,
  updatePendingStatus,
  patchPendingUpload,
  resetStalledUploads,
  removePendingUpload,
  type PendingUpload,
} from './offlineStore';

const MAX_RETRIES = 3;

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Upload a grouped batch of pending captures. 
 * Creates one invoice per batchId.
 */
async function uploadBatch(pendings: PendingUpload[]): Promise<boolean> {
  if (pendings.length === 0) return true;
  
  const pharmacyId = pendings[0].pharmacyId;

  // Reuse an invoiceId already pinned to this batch by a previous attempt (idempotent retries),
  // otherwise mint a new one. This stops a partial-failure retry from creating a duplicate invoice.
  const invoicesRef = collection(db, 'pharmacies', pharmacyId, 'invoices');
  const pinnedInvoiceId = pendings.find((p) => p.invoiceId)?.invoiceId;
  const invoiceDoc = pinnedInvoiceId ? doc(invoicesRef, pinnedInvoiceId) : doc(invoicesRef);
  const invoiceId = invoiceDoc.id;

  try {
    for (const pending of pendings) {
      await patchPendingUpload(pending.id, { status: 'uploading', invoiceId });
    }

    const imageUrls: string[] = [];

    // Upload each file to Storage
    for (let i = 0; i < pendings.length; i++) {
      const pending = pendings[i];

      // Skip files already uploaded in a prior attempt — avoids re-uploading and the
      // no-overwrite Storage rule, and keeps the same paths on the invoice doc.
      if (pending.uploadedPath) {
        imageUrls.push(pending.uploadedPath);
        continue;
      }

      let fileToUpload: Blob = pending.file;
      if (pending.fileType === 'image') {
        const asFile = new File([pending.file], pending.fileName, { type: pending.file.type });
        fileToUpload = await imageCompression(asFile, { maxSizeMB: 1, maxWidthOrHeight: 2400, useWebWorker: true });
      }

      const timestamp = Date.now();
      const hash = Math.random().toString(36).substring(2, 8);
      const ext = pending.fileType === 'pdf' ? 'pdf' : 'jpg';
      const storagePath = `pharmacies/${pharmacyId}/invoices/${invoiceId}/original_${timestamp}_${hash}_p${i}.${ext}`;

      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, fileToUpload);
      await patchPendingUpload(pending.id, { uploadedPath: storagePath });
      imageUrls.push(storagePath);
    }

    // If a prior attempt already created this invoice, do NOT re-create it or re-trigger
    // processing — that would regress a status the backend has since advanced (e.g. review ->
    // uploading) and cause a second processing run. Just clean up the queue.
    const existing = await getDoc(invoiceDoc);
    if (existing.exists()) {
      for (const pending of pendings) {
        await removePendingUpload(pending.id);
      }
      return true;
    }

    // Fetch pharmacy settings
    let visionApiMode = 'gemini_vision';
    let ocrProvider = 'vision';
    let intelProvider = 'gemini';
    let geminiModel = 'flash';
    let deepseekModel = 'deepseek-v4-pro';
    let zaiModel = 'glm-5.1';
    
    try {
      const pharmacyDoc = await getDoc(doc(db, 'pharmacies', pharmacyId));
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
      // Default
    }

    // Create Firestore document
    await setDoc(invoiceDoc, {
      pharmacyId,
      uploadedBy: auth.currentUser?.uid ?? null,
      uploadedByName: auth.currentUser?.displayName ?? null,
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
      capturedOffline: true,
      capturedAt: new Date(pendings[0].capturedAt),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }, { merge: true });

    // Trigger processing
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(getApiUrl('processInvoice'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        invoiceId,
        pharmacyId,
        visionApiMode,
        geminiModel,
        deepseekModel,
      }),
    });

    if (!res.ok) {
      console.warn('[OfflineSync] Processing trigger failed, invoice created but not processed');
    }

    // Cleanup
    for (const pending of pendings) {
      await removePendingUpload(pending.id);
    }
    return true;
  } catch (err) {
    console.error('[OfflineSync] Upload failed:', err);
    for (const pending of pendings) {
      const newRetry = pending.retryCount + 1;
      if (newRetry >= MAX_RETRIES) {
        await updatePendingStatus(pending.id, 'failed', newRetry);
      } else {
        await updatePendingStatus(pending.id, 'pending', newRetry);
      }
    }
    return false;
  }
}

/** Sync all pending offline captures */
export async function syncPendingUploads(): Promise<SyncResult> {
  // Recover anything left in 'uploading' by an interrupted previous run before we read the queue.
  await resetStalledUploads();

  const pending = await getPendingUploads();
  const toSync = pending.filter((p) => p.status === 'pending');

  let synced = 0;
  let failed = 0;

  // Group by batchId (or fallback to id if old item)
  const grouped = new Map<string, PendingUpload[]>();
  for (const item of toSync) {
    const key = item.batchId || item.id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  for (const batch of grouped.values()) {
    const success = await uploadBatch(batch);
    if (success) synced += batch.length;
    else failed += batch.length;
  }

  const remaining = (await getPendingUploads()).filter(
    (p) => p.status === 'pending'
  ).length;

  return { synced, failed, remaining };
}

/** Start listening for online events and auto-sync */
export function startAutoSync(onSync?: (result: SyncResult) => void): () => void {
  let syncing = false;

  const runSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const result = await syncPendingUploads();
      if (result.synced > 0) {
        onSync?.(result);
      }
    } finally {
      syncing = false;
    }
  };

  // Serialize sync across tabs with a Web Lock so two tabs coming online together can't both
  // pick up the same queued captures and create duplicate invoices. Falls back to a plain run.
  const handleOnline = () => {
    const locks = navigator.locks;
    const p = locks?.request
      ? locks.request('skanifyrx-offline-sync', { ifAvailable: true }, (lock) => (lock ? runSync() : undefined))
      : runSync();
    Promise.resolve(p).catch((err) => console.error('[OfflineSync] sync error:', err));
  };

  window.addEventListener('online', handleOnline);

  // Also try syncing immediately if already online
  if (navigator.onLine) {
    handleOnline();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
