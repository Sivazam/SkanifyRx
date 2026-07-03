import { useState, useRef, useEffect } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { ConfirmationResult } from 'firebase/auth';

export function LoginPage() {
  const { sendOtp, verifyOtp, signInWithGoogle } = useAuthContext();
  const navigate = useNavigate();

  // Release the invisible reCAPTCHA verifier when leaving the page so a later visit can
  // re-render it cleanly (otherwise "reCAPTCHA has already been rendered" can block re-login).
  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Format phone: add +91 if not present
      const formatted = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;
      const confirmation = await sendOtp(formatted, 'recaptcha-container');
      confirmationRef.current = confirmation;
      setStep('otp');
    } catch (err) {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!confirmationRef.current) throw new Error('No confirmation result');
      await verifyOtp(confirmationRef.current, otp);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel: Dynamic Background */}
      <div className="hidden lg:flex w-1/2 relative bg-zinc-900 overflow-hidden items-center justify-center">
        <img 
          src="/login-bg.png" 
          alt="Healthcare Technology" 
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/20 to-transparent"></div>
        <div className="relative z-10 p-12 text-white mt-auto w-full mb-12">
          <div className="flex items-center gap-3 mb-6">
            <img src="/pwa-192x192.png" alt="AccuBolt Logo" className="w-12 h-12 rounded-xl shadow-lg" />
            <h1 className="text-3xl font-bold tracking-tight">AccuBolt</h1>
          </div>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight max-w-xl">
            Enterprise-grade invoice digitization for modern pharmacies.
          </h2>
          <p className="mt-4 text-zinc-300 max-w-lg text-lg">
            Scan, extract, and auto-sync your entire inventory workflow directly into your ERP system with 99.9% AI accuracy.
          </p>
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 sm:p-12 lg:p-24 bg-white relative">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden text-center">
            <img src="/pwa-192x192.png" alt="AccuBolt" className="mx-auto h-16 w-16 rounded-2xl shadow-sm mb-4" />
            <h1 className="text-2xl font-bold text-zinc-900">AccuBolt</h1>
          </div>

          <div className="mb-10 text-left">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900">Welcome back</h2>
            <p className="mt-2 text-sm text-zinc-500">Sign in to your pharmacy dashboard to continue.</p>
          </div>

          <div className="space-y-6">
            {/* Google Sign-In */}
            <button
              type="button"
              onClick={async () => {
                setGoogleLoading(true);
                setError('');
                try {
                  await signInWithGoogle();
                  navigate('/');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Google sign-in failed');
                } finally {
                  setGoogleLoading(false);
                }
              }}
              disabled={googleLoading || loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {googleLoading ? 'Signing in...' : 'Continue with Google'}
            </button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-zinc-500">Or continue with phone</span>
              </div>
            </div>

            {step === 'phone' ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 mb-1.5">Phone Number</label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-colors"
                    required
                  />
                </div>
                <div id="recaptcha-container" className="my-4 flex justify-center"></div>
                {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {loading ? 'Sending OTP...' : 'Send Login Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-zinc-700 mb-1.5">Verification Code</label>
                  <input
                    id="otp"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="block w-full rounded-xl border border-zinc-300 px-4 py-3 text-center text-xl tracking-widest text-zinc-900 placeholder-zinc-300 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-colors"
                    required
                  />
                  <p className="mt-2 text-xs text-zinc-500 text-center">We sent a code to {phone}</p>
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full justify-center rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-900"
                >
                  Back to phone entry
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 text-center text-xs text-zinc-400">
            By signing in, you agree to our{' '}
            <a href="/terms" className="text-zinc-900 hover:underline">Terms</a>
            {' & '}
            <a href="/privacy" className="text-zinc-900 hover:underline">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
