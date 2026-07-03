import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { ErrorBoundary } from './ErrorBoundary';
import { InstallBanner } from './InstallBanner';
import { useOnlineStatus, usePendingCount } from '../hooks/useOnlineStatus';
import { startAutoSync } from '../lib/offlineSync';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { Toaster } from 'react-hot-toast';

export function Layout() {
  const { user, signOut } = useAuthContext();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { count: pendingCount, refresh: refreshPending } = usePendingCount();

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Auto-sync offline captures when coming online
  useEffect(() => {
    const cleanup = startAutoSync((result) => {
      refreshPending();
      if (result.synced > 0) {
        // Could show a toast; for now just refresh the pending count
        console.log(`[AutoSync] Synced ${result.synced} captures`);
      }
    });
    return cleanup;
  }, [refreshPending]);

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      {/* Desktop Sidebar */}
      <Sidebar user={user} handleSignOut={() => setShowSignOutConfirm(true)} />

      {/* Main Content Wrapper (leaves room for sidebar on desktop) */}
      <div className={`flex flex-col flex-1 ${user ? 'sm:ml-64' : ''}`}>
        
        {/* Top Navigation & Status */}
        <TopBar user={user} isOnline={isOnline} pendingCount={pendingCount} handleSignOut={() => setShowSignOutConfirm(true)} />

        {/* Main Content Area */}
        <main className="w-full flex-1 p-4 sm:p-8 max-w-7xl mx-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Bottom Navigation (mobile only) */}
        {user && <BottomNav />}
      </div>

      {/* Install Banner */}
      <InstallBanner />
      
      {/* Global Notifications */}
      <Toaster position="top-center" />

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Sign Out</h3>
                <p className="text-sm text-gray-500">Are you sure you want to sign out?</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
