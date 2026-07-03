/**
 * Offline capture storage — IndexedDB for queuing images when offline.
 * Auto-syncs when connectivity returns.
 */

const DB_NAME = 'skanifyrx-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pendingUploads';

export interface PendingUpload {
  id: string; // crypto.randomUUID()
  pharmacyId: string;
  batchId?: string; // Group multi-page uploads
  file: Blob;
  fileName: string;
  fileType: 'image' | 'pdf';
  capturedAt: number; // Date.now()
  status: 'pending' | 'uploading' | 'failed';
  retryCount: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save a captured image/PDF for later upload */
export async function savePendingUpload(
  pharmacyId: string,
  file: Blob,
  fileName: string,
  fileType: 'image' | 'pdf',
  batchId?: string,
): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();

  const record: PendingUpload = {
    id,
    pharmacyId,
    batchId,
    file,
    fileName,
    fileType,
    capturedAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve(id);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Get all pending uploads */
export async function getPendingUploads(): Promise<PendingUpload[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/** Get count of pending uploads */
export async function getPendingCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('status');
    const request = index.count(IDBKeyRange.only('pending'));

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/** Update status of a pending upload */
export async function updatePendingStatus(
  id: string,
  status: PendingUpload['status'],
  retryCount?: number,
): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as PendingUpload | undefined;
      if (record) {
        record.status = status;
        if (retryCount !== undefined) record.retryCount = retryCount;
        store.put(record);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Remove a completed upload from the store */
export async function removePendingUpload(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Clear all pending uploads */
export async function clearPendingUploads(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
