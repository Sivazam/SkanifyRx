import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { InactiveAccountScreen } from './InactiveAccountScreen';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, userProfile, loading } = useAuthContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Block inactive users (unless they are on the onboarding page trying to set up).
  // Treat a missing profile as NOT active — a null profile must not fall through to protected
  // content. (Firestore rules are the real enforcement; this keeps the UI consistent.)
  if (user && !userProfile?.active && location.pathname !== '/onboarding') {
    return <InactiveAccountScreen />;
  }

  // Redirect to onboarding if user has no pharmacy
  if (!user.pharmacyId && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
