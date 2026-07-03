import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { getStatusProgress } from '../lib/progress';
import type { Invoice } from '../types';

export function GlobalProgressOverlay() {
  const { user } = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeInvoices, setActiveInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    if (!user?.pharmacyId) return;

    const colRef = collection(db, 'pharmacies', user.pharmacyId, 'invoices');
    // Listen to invoices that are actively processing
    const q = query(
      colRef, 
      where('status', 'in', ['uploading', 'preprocessing', 'ocr_running', 'validating'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const active = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setActiveInvoices(active);
      },
      (err) => {
        console.error('[GlobalProgressOverlay] invoice listener error:', err);
        setActiveInvoices([]);
      },
    );

    return () => unsubscribe();
  }, [user?.pharmacyId]);

  if (activeInvoices.length === 0) return null;
  // Hide if on dashboard where invoices are shown
  if (location.pathname === '/') return null;

  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 w-80 max-w-[calc(100vw-2rem)]">
      {activeInvoices.map(inv => {
        const pct = getStatusProgress(inv.status);
        return (
          <div 
            key={inv.id} 
            onClick={() => navigate(`/processing/${inv.id}`)}
            className="cursor-pointer overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-4 animate-in fade-in slide-in-from-top-4 hover:shadow-xl transition-all"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-sm text-zinc-900 truncate pr-2">
                {inv.supplierName || 'Processing Invoice...'}
              </span>
              <span className="text-xs font-bold text-blue-600">{pct}%</span>
            </div>
            <div className="h-2 w-full bg-blue-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out animate-pulse"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2 font-medium capitalize flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              {inv.status === 'ocr_running' ? 'extracting data' : inv.status.replace('_', ' ')}
            </p>
          </div>
        );
      })}
    </div>
  );
}
