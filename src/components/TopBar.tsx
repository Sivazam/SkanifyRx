import { NavLink } from 'react-router-dom';
import type { AuthUser } from '../types';

interface TopBarProps {
  user: AuthUser | null;
  isOnline: boolean;
  pendingCount: number;
  handleSignOut?: () => void;
}

export function TopBar({ user, isOnline, pendingCount, handleSignOut }: TopBarProps) {
  return (
    <>
      {/* Mobile Header (Only visible on small screens or when logged out) */}
      <header className={`sticky top-0 z-40 glass shadow-sm ${user ? 'sm:hidden' : ''}`}>
        <div className="mx-auto flex h-14 w-full items-center justify-between px-4">
          <NavLink to="/" className="flex items-center gap-2 text-lg font-bold text-[var(--color-primary)]">
            <img src="/pwa-192x192.png" alt="AccuBolt" className="h-8 w-8 rounded-lg shadow-sm" />
            AccuBolt
          </NavLink>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Offline
              </span>
            )}
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 border border-blue-200">
                {pendingCount} pending
              </span>
            )}
            {user && (
              <>
                <NavLink to="/settings" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-[var(--color-primary)] transition-colors" title="Settings">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </NavLink>
                {handleSignOut && (
                  <button onClick={handleSignOut} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600 transition-colors" title="Sign Out">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Top Bar Status (Only visible on desktop) */}
      {user && (
        <div className="hidden sm:flex h-14 items-center justify-end px-8 sticky top-0 z-30 bg-[var(--color-bg)]/80 backdrop-blur-sm border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 border border-amber-200 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Offline Mode
              </span>
            )}
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 border border-blue-200 shadow-sm">
                {pendingCount} pending syncs
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
