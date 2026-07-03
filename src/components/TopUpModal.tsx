import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onSuccess: () => void;
}

export function TopUpModal({ isOpen, onClose, userId, userName, onSuccess }: TopUpModalProps) {
  const [credits, setCredits] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credits || typeof credits !== 'number' || credits <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    try {
      // Use standard fetch to call cloud function
      const auth = await import('../lib/firebase').then(m => m.auth);
      const token = await auth.currentUser?.getIdToken();
      
      const res = await fetch('https://asia-south2-skanifyrx.cloudfunctions.net/adminTopUpCredits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUid: userId, credits, note })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to add credits');
      }

      toast.success(`${credits} credits added to ${userName}`);
      onSuccess();
      onClose();
      setCredits('');
      setNote('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add credits');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-xl font-bold text-slate-900">Add Credits</h3>
        <p className="mb-6 text-sm text-slate-600">
          Adding credits for <span className="font-semibold text-slate-900">{userName}</span>
        </p>

        <form onSubmit={handleTopUp} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Amount (Pages)</label>
            <input
              type="number"
              min="1"
              required
              value={credits}
              onChange={(e) => setCredits(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Note (Optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
              placeholder="e.g. Monthly top-up"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !credits || credits <= 0}
              className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              {isLoading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Add Credits
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
