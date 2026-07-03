import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useExportedInvoiceList } from '../hooks/useInvoice';
import { CardSkeleton } from '../components/Skeleton';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { downloadCSV } from '../lib/csvExport';

function HistoryThumbnail({ imageUrls }: { imageUrls: string[] }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrls || imageUrls.length === 0) return;
    const rawUrl = imageUrls[0];
    let storagePath = rawUrl;
    if (rawUrl.startsWith('gs://')) {
      storagePath = rawUrl.replace(/^gs:\/\/[^/]+\//, '');
    } else if (rawUrl.includes('firebasestorage.googleapis.com')) {
      const match = rawUrl.match(/\/o\/(.+?)(\?|$)/);
      storagePath = match ? decodeURIComponent(match[1]) : rawUrl;
    }
    getDownloadURL(ref(storage, storagePath)).then(setUrl).catch(() => {});
  }, [imageUrls]);

  if (!url) return <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-400">📄</div>;
  if (url.split('?')[0].toLowerCase().endsWith('.pdf') || url.toLowerCase().includes('%2f.pdf')) {
    return <div className="h-12 w-12 rounded bg-blue-50 flex items-center justify-center text-xl">📄</div>;
  }
  return <img src={url} alt="Thumbnail" className="h-12 w-12 rounded object-cover border border-gray-200" />;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { invoices: exportedInvoices, loading, loadingMore, hasMore, loadMore } = useExportedInvoiceList(user?.pharmacyId ?? null);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Export History</h1>
          <p className="mt-1 text-sm text-zinc-500">View and download your previously exported invoices.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : exportedInvoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-12 text-center backdrop-blur-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 mb-4 shadow-inner">
            <svg className="h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-zinc-900 tracking-tight">No exports yet</h3>
          <p className="mt-2 text-sm text-zinc-500 max-w-sm mx-auto">
            Confirmed invoices that have been exported will appear here for your records.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {exportedInvoices.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <HistoryThumbnail imageUrls={inv.imageUrls} />
                <div>
                  <h3 className="font-semibold text-zinc-900 text-lg">
                    {inv.supplierName || 'Unknown Supplier'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm font-medium text-zinc-500">#{inv.invoiceNumber || inv.id}</span>
                    <span className="text-zinc-300">•</span>
                    <span className="text-sm text-zinc-500">{inv.totalItems ?? 0} items</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {inv.invoiceDate || 'No Date'}
                  </p>
                </div>
              </div>
              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto">
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  Exported
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => navigate(`/review/${inv.invoiceId}`)}
                    className="flex-1 sm:flex-none rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-all active:scale-[0.98]"
                  >
                    View
                  </button>
                  <button
                    onClick={() => {
                      const filename = `Invoice_${inv.invoiceNumber || inv.id}.csv`;
                      downloadCSV(inv.products || [], filename, undefined, {
                        invoiceNumber: inv.invoiceNumber,
                        invoiceDate: inv.invoiceDate,
                      });
                    }}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 transition-all active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    CSV
                  </button>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 transition-all"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
