import { useAuthContext } from '../context/AuthContext';

export function InactiveAccountScreen() {
  const { signOut } = useAuthContext();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 mb-6">
          <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Account Pending Activation</h2>
        <p className="text-slate-600 mb-8">
          Your account has been created successfully, but it is currently inactive. Please contact your administrator to activate your account and grant you access.
        </p>
        
        <div className="flex flex-col gap-4">
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            Check Status Again
          </button>
          
          <button
            onClick={signOut}
            className="w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
