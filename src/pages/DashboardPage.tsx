import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useInvoiceList } from '../hooks/useInvoice';
import { CardSkeleton } from '../components/Skeleton';
import { getStatusProgress } from '../lib/progress';
import type { Invoice, InvoiceStatus } from '../types';
import { deleteDoc, doc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

const statusConfig: Record<InvoiceStatus, { label: string; color: string }> = {
  uploading: { label: 'Uploading', color: 'bg-blue-100 text-blue-800' },
  preprocessing: { label: 'Processing', color: 'bg-blue-100 text-blue-800' },
  ocr_running: { label: 'Extracting Data', color: 'bg-purple-100 text-purple-800' },
  validating: { label: 'Validating', color: 'bg-yellow-100 text-yellow-800' },
  review: { label: 'Ready for Review', color: 'bg-orange-100 text-orange-800' },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800' },
  exported: { label: 'Exported', color: 'bg-gray-100 text-gray-700' },
  error: { label: 'Error', color: 'bg-red-100 text-red-800' },
};

function formatDateGroup(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr);
  const todayStr = today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const targetStr = date.toDateString();

  if (targetStr === todayStr) return 'Today';
  if (targetStr === yesterdayStr) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function InvoiceCard({ invoice, onDelete }: { invoice: Invoice, onDelete: (id: string) => void }) {
  const navigate = useNavigate();
  const isReadyAndUnread = invoice.status === 'review' && invoice.viewed === false;
  
  const cardClasses = isReadyAndUnread
    ? 'group relative w-full rounded-xl border-2 border-green-400 bg-green-50 p-5 shadow-sm hover:shadow-md hover:border-green-500 transition-all duration-200 hover:-translate-y-0.5'
    : 'group relative w-full rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-zinc-300 transition-all duration-200 hover:-translate-y-0.5';

  const status = statusConfig[invoice.status];

  const handleClick = () => {
    if (invoice.status === 'review') {
      navigate(`/review/${invoice.id}`);
    } else if (invoice.status === 'preprocessing' || invoice.status === 'ocr_running' || invoice.status === 'validating' || invoice.status === 'error') {
      navigate(`/processing/${invoice.id}`);
    }
  };

  return (
    <div className={cardClasses}>
      <button onClick={handleClick} className="w-full text-left">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-12">
            <h3 className={`truncate font-medium ${isReadyAndUnread ? 'text-green-900' : 'text-gray-900'}`}>
              {invoice.supplierName || 'Unknown Supplier'}
            </h3>
            <p className={`mt-0.5 text-sm ${isReadyAndUnread ? 'text-green-700' : 'text-gray-500'}`}>
              {invoice.invoiceNumber || 'No invoice #'} •{' '}
              {invoice.invoiceDate || 'No date'}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
            >
              {status.label}
            </span>
            {isReadyAndUnread && (
              <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-500 text-white shadow-sm animate-pulse">
                NEW
              </span>
            )}
          </div>
        </div>
        
        {['uploading', 'preprocessing', 'ocr_running', 'validating'].includes(invoice.status) && (
          <div className="mt-4 mb-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-blue-600">Progress</span>
              <span className="text-xs font-bold text-blue-600">{getStatusProgress(invoice.status)}%</span>
            </div>
            <div className="h-1.5 w-full bg-blue-50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out animate-pulse"
                style={{ width: `${getStatusProgress(invoice.status)}%` }}
              />
            </div>
          </div>
        )}

        {invoice.totalItems != null && (
          <p className={`mt-2 text-sm ${isReadyAndUnread ? 'text-green-800' : 'text-gray-600'}`}>
            {invoice.totalItems} items
            {invoice.totalAmount != null && ` • ₹${invoice.totalAmount.toLocaleString('en-IN')}`}
          </p>
        )}
      </button>
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete(invoice.id); }}
        className="absolute top-4 right-4 z-10 hidden group-hover:flex items-center justify-center p-2 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-800 transition-colors"
        title="Delete Invoice"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuthContext();
  const [limitCount, setLimitCount] = useState(50);
  const { invoices, loading, hasMore } = useInvoiceList(user?.pharmacyId ?? null, limitCount);
  const navigate = useNavigate();

  const groupedInvoices = useMemo(() => {
    const groups: Record<string, Invoice[]> = {};
    invoices.forEach(inv => {
      let dateStr = "Unknown Date";
      if (inv.createdAt) {
        dateStr = new Date((inv.createdAt as unknown as { toDate?: () => Date }).toDate?.() ?? inv.createdAt).toISOString();
      }
      
      const groupKey = dateStr !== "Unknown Date" ? formatDateGroup(dateStr) : dateStr;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(inv);
    });
    return groups;
  }, [invoices]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage and track your digitized invoices.</p>
        </div>
        <button
          onClick={() => navigate('/capture')}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-zinc-800 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Scan Invoice
        </button>
      </div>

      {/* User Stats Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Available Credits</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900">{useAuthContext().userProfile?.credits ?? 0}</span>
            <span className="text-sm text-zinc-500">pages remaining</span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Total Scans</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900">{useAuthContext().userProfile?.totalScans ?? 0}</span>
            <span className="text-sm text-zinc-500">pages processed</span>
          </div>
        </div>
      </div>

      {loading && invoices.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-12 text-center backdrop-blur-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 mb-4 shadow-inner">
            <svg className="h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-zinc-900 tracking-tight">No invoices yet</h3>
          <p className="mt-2 text-sm text-zinc-500 max-w-sm mx-auto">
            Get started by scanning your first pharmacy invoice. It takes just a few seconds.
          </p>
          <button
            onClick={() => navigate('/capture')}
            className="mt-6 inline-flex items-center text-sm font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
          >
            Scan your first invoice <span aria-hidden="true" className="ml-1">→</span>
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedInvoices).map(([groupDate, groupInvoices]) => (
            <div key={groupDate}>
              <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2 border-b border-zinc-200 pb-2">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {groupDate}
                <span className="bg-zinc-100 text-zinc-600 text-xs py-0.5 px-2 rounded-full font-medium ml-2">
                  {groupInvoices.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupInvoices.map((inv) => (
                  <InvoiceCard key={inv.id} invoice={inv} onDelete={async (id) => {
                    if (window.confirm('Are you sure you want to delete this invoice?')) {
                      try {
                        const invoiceRef = doc(db, 'pharmacies', user!.pharmacyId!, 'invoices', id);
                        // Best-effort: remove the invoice's Storage images so they don't orphan.
                        try {
                          const snap = await getDoc(invoiceRef);
                          const urls = (snap.data()?.imageUrls as string[] | undefined) ?? [];
                          await Promise.all(urls.map((p) => deleteObject(ref(storage, p)).catch(() => {})));
                        } catch { /* ignore storage cleanup errors */ }
                        // Delete the lineItems subcollection (client deleteDoc doesn't cascade).
                        try {
                          const liSnap = await getDocs(collection(invoiceRef, 'lineItems'));
                          if (!liSnap.empty) {
                            const batch = writeBatch(db);
                            liSnap.docs.forEach((d) => batch.delete(d.ref));
                            await batch.commit();
                          }
                        } catch { /* ignore line-item cleanup errors */ }
                        await deleteDoc(invoiceRef);
                      } catch (error) {
                        console.error("Error deleting document: ", error);
                        alert("Failed to delete invoice.");
                      }
                    }
                  }} />
                ))}
              </div>
            </div>
          ))}
          
          {hasMore && (
            <div className="flex justify-center pt-6 pb-12">
              <button 
                onClick={() => setLimitCount(prev => prev + 50)}
                className="inline-flex items-center gap-2 rounded-xl bg-white border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                Load More Documents
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
