import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useInvoice } from '../hooks/useInvoice';
import { auth } from '../lib/firebase';
import { getApiUrl } from '../lib/api';
import type { InvoiceStatus } from '../types';

import { ScannerAnimation } from '../components/ScannerAnimation';

const steps: { status: InvoiceStatus; label: string; icon: string }[] = [
  { status: 'uploading', label: 'Uploading images', icon: '📤' },
  { status: 'preprocessing', label: 'Enhancing image quality', icon: '🔧' },
  { status: 'ocr_running', label: 'Reading text', icon: '🔍' },
  { status: 'validating', label: 'Validating data', icon: '✅' },
];

function getStepIndex(status: InvoiceStatus): number {
  const idx = steps.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : steps.length;
}

// Statuses that mean the backend is still working. Anything else is terminal/handled elsewhere.
const IN_PROGRESS: InvoiceStatus[] = ['uploading', 'preprocessing', 'ocr_running', 'validating'];

// If an invoice stays in an in-progress status this long, the backend has almost certainly
// stalled or died without writing status:'error' — surface a retry instead of an infinite spinner.
const STALL_THRESHOLD_MS = 3 * 60 * 1000;

/** Coerce a Firestore Timestamp | Date | ISO string | millis into epoch millis. */
function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (value instanceof Date) return value.getTime();
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

export function ProcessingPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { invoice, loading } = useInvoice(
    user?.pharmacyId ?? null,
    invoiceId ?? null
  );
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [now, setNow] = useState(() => 0);

  // Tick every 15s so the stall check re-evaluates without a status change from the backend.
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const isInProgress = invoice ? IN_PROGRESS.includes(invoice.status) : false;
  const startedMs = toMillis(invoice?.updatedAt) ?? toMillis(invoice?.createdAt);
  const isStalled =
    isInProgress &&
    !invoice?.processingError &&
    startedMs !== null &&
    Date.now() - startedMs > STALL_THRESHOLD_MS;
  // `now` is referenced so the interval tick forces this component (and isStalled) to recompute.
  void now;

  const handleRetry = async () => {
    if (!user?.pharmacyId || !invoiceId) return;
    setRetrying(true);
    setRetryError('');

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(getApiUrl('processInvoice'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoiceId,
          pharmacyId: user.pharmacyId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Retry failed');
      }
      // Success — onSnapshot will pick up the status change
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8">
        <ScannerAnimation />
        <p className="text-sm font-medium text-zinc-500 animate-pulse">Loading invoice...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm max-w-md mx-auto mt-12">
        <div className="mb-4 text-4xl">📄</div>
        <h2 className="text-lg font-semibold text-zinc-900">Invoice not found</h2>
        <p className="mt-2 text-sm text-zinc-500">The requested invoice could not be located.</p>
      </div>
    );
  }

  // If review ready, redirect-like render
  if (invoice.status === 'review' || invoice.status === 'confirmed' || invoice.status === 'exported') {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm max-w-md mx-auto mt-12 animate-in zoom-in-95 duration-500">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-6 shadow-inner">
          <svg className="h-10 w-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Processing Complete!</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Your invoice has been digitized and is ready for review.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={() => navigate(`/review/${invoiceId}`)}
            className="w-full rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-zinc-800 transition-all active:scale-[0.98]"
          >
            Review Invoice
          </button>
          <button
            onClick={() => navigate('/capture')}
            className="w-full rounded-xl bg-white border border-zinc-200 px-6 py-3.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 transition-all active:scale-[0.98]"
          >
            Scan Another Document
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (invoice.status === 'error' || invoice.processingError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm max-w-md mx-auto mt-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 mb-6 shadow-inner">
          <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-zinc-900">Processing Failed</h2>
        <p className="mt-2 text-sm text-red-600 font-medium">{invoice.processingError}</p>
        {retryError && (
          <p className="mt-2 text-sm text-red-600">{retryError}</p>
        )}
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-8 w-full rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {retrying ? 'Retrying...' : 'Retry Processing'}
        </button>
      </div>
    );
  }

  // Stalled state — backend stopped advancing status well past the expected processing time.
  if (isStalled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-white p-10 text-center shadow-sm max-w-md mx-auto mt-12">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 mb-6 shadow-inner">
          <svg className="h-10 w-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-zinc-900">Taking longer than expected</h2>
        <p className="mt-2 text-sm text-zinc-500">
          This invoice has been processing for a while and may have stalled. You can retry, or come
          back later — if it finishes, you'll get a notification.
        </p>
        {retryError && <p className="mt-2 text-sm text-red-600">{retryError}</p>}
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="w-full rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            {retrying ? 'Retrying...' : 'Retry Processing'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-white border border-zinc-200 px-6 py-3.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 transition-all active:scale-[0.98]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(invoice.status);

  return (
    <div className="mx-auto max-w-lg mt-8">
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-200/50">
        
        {/* 3D Scanner Animation */}
        <div className="mb-12 mt-4">
          <ScannerAnimation />
        </div>

        <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-zinc-900">
          Digitizing Invoice
        </h1>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;

            return (
              <div
                key={step.status}
                className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-all duration-300 ${
                  isCurrent
                    ? 'bg-blue-50 border border-blue-200/60 shadow-sm shadow-blue-100/50 scale-[1.02]'
                    : isCompleted
                      ? 'bg-emerald-50/50 border border-emerald-100/50'
                      : 'bg-zinc-50 border border-transparent opacity-60'
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isCurrent ? 'bg-blue-100 text-blue-600' : isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-zinc-200 text-zinc-400'
                }`}>
                  <span className="text-sm">
                    {isCompleted ? '✓' : isCurrent ? step.icon : '•'}
                  </span>
                </div>
                <span
                  className={`text-sm font-semibold tracking-tight ${
                    isCurrent
                      ? 'text-blue-900'
                      : isCompleted
                        ? 'text-emerald-900'
                        : 'text-zinc-500'
                  }`}
                >
                  {step.label}
                  {isCurrent && (
                    <span className="ml-1 inline-flex space-x-0.5">
                      <span className="animate-[bounce_1.4s_infinite] text-blue-500">.</span>
                      <span className="animate-[bounce_1.4s_infinite_0.2s] text-blue-500">.</span>
                      <span className="animate-[bounce_1.4s_infinite_0.4s] text-blue-500">.</span>
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col items-center gap-4">
          <p className="text-center text-xs text-gray-400">
            You can navigate away — processing will continue in the background.
          </p>
          <button
            onClick={() => navigate('/capture')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 transition-all active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Scan Another Document
          </button>
        </div>
      </div>
    </div>
  );
}
