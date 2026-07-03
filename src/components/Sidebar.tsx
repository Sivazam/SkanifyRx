import { NavLink } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

interface SidebarProps {
  user: any;
  handleSignOut: () => void;
}

export function Sidebar({ user, handleSignOut }: SidebarProps) {
  const { userProfile } = useAuthContext();
  if (!user) return null;

  return (
    <aside className="hidden w-64 flex-col glass-sidebar z-50 sm:flex fixed h-screen left-0 top-0">
      <div className="flex h-16 items-center gap-3 px-6 border-b border-[var(--color-border)]">
        <img src="/pwa-192x192.png" alt="AccuBolt" className="h-8 w-8 rounded-lg shadow-sm" />
        <span className="text-xl font-bold tracking-tight text-[var(--color-primary)]">AccuBolt</span>
      </div>

      <nav className="flex-1 space-y-2 px-4 py-6 overflow-y-auto">
        <NavLink to="/" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive ? 'bg-[var(--color-primary-dark)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
          Invoices
        </NavLink>
        <NavLink to="/capture" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive ? 'bg-[var(--color-primary-dark)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Scan Document
        </NavLink>
        <NavLink to="/master" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive ? 'bg-[var(--color-primary-dark)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          Drug Master
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive ? 'bg-[var(--color-primary-dark)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          History
        </NavLink>
        <NavLink to="/usage" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive ? 'bg-[var(--color-primary-dark)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          Usage
        </NavLink>
        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
          <NavLink to="/admin" className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all ${isActive ? 'bg-[var(--color-primary-dark)] text-white shadow-md' : 'text-[var(--color-text-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]'}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Admin Dashboard
          </NavLink>
        )}
      </nav>

      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 font-bold text-slate-600">
            {(user.displayName || user.email || 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">{user.displayName || user.phoneNumber || 'User'}</p>
            <p className="truncate text-xs text-[var(--color-text-muted)]">{user.email || 'Pharmacy'}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <NavLink to="/settings" className="flex-1 flex justify-center items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 bg-white shadow-sm transition-all active:scale-95" title="Settings">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </NavLink>
          <button onClick={handleSignOut} className="flex-[3] flex justify-center items-center rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 border border-red-100 bg-white shadow-sm transition-all active:scale-95">
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
