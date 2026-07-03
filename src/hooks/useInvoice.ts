import { useState, useEffect, useCallback } from 'react';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Invoice, LineItem } from '../types';

/** Subscribe to real-time invoice status updates */
export function useInvoice(pharmacyId: string | null, invoiceId: string | null) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Listen to invoice document
  useEffect(() => {
    if (!pharmacyId || !invoiceId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'pharmacies', pharmacyId, 'invoices', invoiceId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setInvoice({ id: snap.id, ...snap.data() } as Invoice);
      } else {
        setInvoice(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [pharmacyId, invoiceId]);

  // Listen to line items subcollection
  useEffect(() => {
    if (!pharmacyId || !invoiceId) return;

    const colRef = collection(
      db,
      'pharmacies',
      pharmacyId,
      'invoices',
      invoiceId,
      'lineItems'
    );
    const q = query(colRef, orderBy('srNo', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as LineItem
      );
      setLineItems(items);
    });

    return () => unsubscribe();
  }, [pharmacyId, invoiceId]);

  return { invoice, lineItems, loading };
}

/** List invoices for a pharmacy (latest first) */
export function useInvoiceList(pharmacyId: string | null, limitCount: number = 50) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!pharmacyId) {
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'pharmacies', pharmacyId, 'invoices');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Invoice);
      setInvoices(items);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === limitCount);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [pharmacyId, limitCount]);

  return { invoices, loading, hasMore, lastDoc };
}

/** Paginated hook for exported invoices (History page) */
export function useExportedInvoiceList(pharmacyId: string | null) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!pharmacyId) {
      setLoading(false);
      return;
    }

    // Initial fetch
    setLoading(true);
    const colRef = collection(db, 'pharmacies', pharmacyId, 'exportedInvoices');
    const q = query(colRef, orderBy('exportedAt', 'desc'), limit(20));
    
    getDocs(q).then((snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInvoices(items);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 20);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [pharmacyId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !lastDoc || !pharmacyId) return;

    setLoadingMore(true);
    try {
      const colRef = collection(db, 'pharmacies', pharmacyId, 'exportedInvoices');
      const q = query(colRef, orderBy('exportedAt', 'desc'), startAfter(lastDoc), limit(20));
      const snap = await getDocs(q);
      
      const newItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setInvoices(prev => [...prev, ...newItems]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 20);
    } catch (err) {
      console.error('Load more failed', err);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, lastDoc, pharmacyId]);

  return { invoices, loading, loadingMore, hasMore, loadMore };
}
