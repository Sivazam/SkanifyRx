import { useState, useEffect, useCallback } from 'react';
import { getPendingCount } from '../lib/offlineStore';

/** Reactive online/offline status */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/** Track pending offline upload count */
export function usePendingCount() {
  const [count, setCount] = useState(0);
  const isOnline = useOnlineStatus();

  const refresh = useCallback(async () => {
    try {
      const c = await getPendingCount();
      setCount(c);
    } catch {
      // IndexedDB not available
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, isOnline]);

  return { count, refresh };
}
