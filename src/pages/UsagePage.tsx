import { useEffect, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UsageLog } from '../types';

export function UsagePage() {
  const { user } = useAuthContext();
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
      setError(null);
      try {
        const q = query(
          collection(db, 'users', user.uid, 'usageLogs'),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UsageLog));
        setLogs(data);
      } catch (err) {
        console.error('Failed to fetch usage logs:', err);
        setError('Could not load your usage history. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[var(--color-primary)]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Usage History</h1>
        <p className="mt-1 text-sm text-slate-500">Track your document scans and credit top-ups.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="text-sm font-medium text-slate-900">No usage data</h3>
            <p className="mt-1 text-sm text-slate-500">Your scan history and top-ups will appear here.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {logs.map((log) => {
                const isDeduction = log.type === 'scan';
                return (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {new Date((log.timestamp as unknown as { toDate?: () => Date }).toDate?.() ?? log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${isDeduction ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'}`}>
                        {isDeduction ? 'Scan Processed' : 'Credit Top-up'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={isDeduction ? 'text-amber-600' : 'text-emerald-600'}>
                        {isDeduction ? '-' : '+'}{isDeduction ? log.creditsDeducted : log.creditsAdded}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 truncate max-w-[200px]" title={log.note || log.invoiceId}>
                      {log.note || (log.invoiceId ? `Invoice: ${log.invoiceId.substring(0, 8)}...` : '-')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
