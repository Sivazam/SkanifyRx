import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';

export function GlobalNotificationListener() {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const knownReadyIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!user?.pharmacyId) return;

    const colRef = collection(db, 'pharmacies', user.pharmacyId, 'invoices');
    // Only listen to invoices that are in review state and not viewed
    const q = query(
      colRef, 
      where('status', '==', 'review'),
      where('viewed', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const docId = change.doc.id;
          const data = change.doc.data();
          
          if (!knownReadyIds.current.has(docId)) {
            knownReadyIds.current.add(docId);
            
            // Don't show toasts for pre-existing unread invoices on first load
            if (initialLoadDone.current) {
               const supplierName = data.supplierName || 'An invoice';
               
               toast((t) => (
                 <div 
                   className="flex items-center gap-3 cursor-pointer"
                   onClick={() => {
                     toast.dismiss(t.id);
                     navigate(`/review/${docId}`);
                   }}
                 >
                   <span className="text-xl">📄</span>
                   <div>
                     <p className="font-semibold text-zinc-900">{supplierName} ready!</p>
                     <p className="text-sm text-zinc-500">Click to view and review data.</p>
                   </div>
                 </div>
               ), { duration: 6000, style: { padding: '12px 16px', borderRadius: '12px' } });
            }
          }
        }
      });
      initialLoadDone.current = true;
    });

    return () => unsubscribe();
  }, [user?.pharmacyId, navigate]);

  return null;
}
