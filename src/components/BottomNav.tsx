import { NavLink } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

export function BottomNav() {
  const { userProfile } = useAuthContext();
  return (
    <nav className="glass sticky bottom-0 z-50 sm:hidden border-t border-[var(--color-border)]">
      <div className="flex h-16 items-center justify-around px-1 pb-safe relative">
        <NavLink to="/" className={({ isActive }) => `flex flex-col items-center py-2 text-[10px] transition-colors w-14 ${isActive ? 'text-[var(--color-primary-dark)] font-bold' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
          {({ isActive }) => (
            <>
              <svg className={`mb-1 h-5 w-5 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              Invoices
            </>
          )}
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `flex flex-col items-center py-2 text-[10px] transition-colors w-14 ${isActive ? 'text-[var(--color-primary-dark)] font-bold' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
          {({ isActive }) => (
            <>
              <svg className={`mb-1 h-5 w-5 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              History
            </>
          )}
        </NavLink>
        <NavLink to="/master" className={({ isActive }) => `flex flex-col items-center py-2 text-[10px] transition-colors w-14 ${isActive ? 'text-[var(--color-primary-dark)] font-bold' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
          {({ isActive }) => (
            <>
              <svg className={`mb-1 h-5 w-5 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Master
            </>
          )}
        </NavLink>
        
        {/* Elevated Scan Button */}
        <div className="relative -top-5 flex justify-center w-14">
          <NavLink to="/capture" className={({ isActive }) => `flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${isActive ? 'bg-[var(--color-primary-dark)] text-white ring-4 ring-[var(--color-primary)]/20' : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]'}`}>
            <svg className="h-6 w-6 stroke-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </NavLink>
        </div>

        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
          <NavLink to="/admin" className={({ isActive }) => `flex flex-col items-center py-2 text-[10px] transition-colors w-14 ${isActive ? 'text-[var(--color-primary-dark)] font-bold' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
            {({ isActive }) => (
              <>
                <svg className={`mb-1 h-5 w-5 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Admin
              </>
            )}
          </NavLink>
        )}
        <NavLink to="/settings" className={({ isActive }) => `flex flex-col items-center py-2 text-[10px] transition-colors w-14 ${isActive ? 'text-[var(--color-primary-dark)] font-bold' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
          {({ isActive }) => (
            <>
              <svg className={`mb-1 h-5 w-5 ${isActive ? 'stroke-2' : 'stroke-[1.5]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Settings
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
}
