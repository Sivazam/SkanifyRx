import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { getApiUrl } from '../lib/api';

export function OnboardingPage() {
  const { user, refreshToken } = useAuthContext();
  const navigate = useNavigate();

  const [pharmacyName, setPharmacyName] = useState('');
  const [drugLicenseNo, setDrugLicenseNo] = useState('');
  const [gstin, setGstin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !pharmacyName.trim()) return;

    setLoading(true);
    setError('');

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(getApiUrl('onboardPharmacy'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pharmacyName: pharmacyName.trim(),
          drugLicenseNo: drugLicenseNo.trim() || undefined,
          gstin: gstin.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Onboarding failed');
      }

      // Force token refresh to pick up pharmacyId custom claim
      await refreshToken();

      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-zinc-900">
            Welcome to AccuBolt
          </h2>
          <p className="mt-2 text-zinc-600">
            Let's set up your pharmacy profile
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Pharmacy Name *
            </label>
            <input
              type="text"
              value={pharmacyName}
              onChange={(e) => setPharmacyName(e.target.value)}
              placeholder="e.g. Apollo Pharmacy"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Drug License No.
            </label>
            <input
              type="text"
              value={drugLicenseNo}
              onChange={(e) => setDrugLicenseNo(e.target.value)}
              placeholder="e.g. MH-MUM-123456"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              GSTIN
            </label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="e.g. 27AABCU9603R1ZM"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              maxLength={15}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !pharmacyName.trim()}
            className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-95"
          >
            {loading ? 'Setting up...' : 'Create Pharmacy'}
          </button>
        </form>
      </div>
    </div>
  );
}
