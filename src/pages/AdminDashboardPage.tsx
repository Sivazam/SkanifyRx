import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { TopUpModal } from '../components/TopUpModal';
import { toast } from 'react-hot-toast';
import { 
  UsersIcon, 
  Cog6ToothIcon as CogIcon, 
  ChartBarIcon, 
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
  ShieldExclamationIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import type { UserProfile, Invoice } from '../types';

export function AdminDashboardPage() {
  const { userProfile } = useAuthContext();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [systemScans, setSystemScans] = useState<Invoice[]>([]);
  const [lastScanDoc, setLastScanDoc] = useState<any>(null);
  const [loadingMoreScans, setLoadingMoreScans] = useState(false);
  const [hasMoreScans, setHasMoreScans] = useState(true);
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);
  const [scanFetchError, setScanFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'settings' | 'usage'>('users');
  
  // Settings state
  const [globalPageLimit, setGlobalPageLimit] = useState(100);
  const [globalDefaultCredits, setGlobalDefaultCredits] = useState(100);
  const [modelSettings, setModelSettings] = useState({
    ocrProvider: 'vision',
    intelligenceProvider: 'gemini',
    geminiModel: 'flash',
    deepseekModel: 'deepseek-v4-pro',
    zaiModel: 'glm-5.1'
  });
  
  // Modal state
  const [topUpUser, setTopUpUser] = useState<{ id: string, name: string } | null>(null);

  useEffect(() => {
    // Role check
    if (!userProfile) return;
    if (userProfile.role !== 'admin' && userProfile.role !== 'super_admin') {
      toast.error('Access denied');
      navigate('/');
      return;
    }

    fetchData();
  }, [userProfile, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const auth = await import('../lib/firebase').then(m => m.auth);
      const token = await auth.currentUser?.getIdToken();

      const [usersRes, db] = await Promise.all([
        fetch('https://asia-south2-skanifyrx.cloudfunctions.net/adminListUsers', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        import('../lib/firebase').then(m => m.db)
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users);
      }

      const { doc, getDoc, collectionGroup, query, orderBy, limit, getDocs } = await import('firebase/firestore');
      
      try {
        const scansQuery = query(collectionGroup(db, 'invoices'), orderBy('createdAt', 'desc'), limit(50));
        const scansSnap = await getDocs(scansQuery);
        const fetchedScans = scansSnap.docs.map(d => ({ 
          id: d.id, 
          pharmacyId: d.ref.parent.parent?.id || 'Unknown',
          ...d.data() 
        } as Invoice));
        setSystemScans(fetchedScans);
        setLastScanDoc(scansSnap.docs[scansSnap.docs.length - 1] || null);
        setHasMoreScans(scansSnap.docs.length === 50);
        setScanFetchError(null);
      } catch (err: any) {
        console.error('Failed to fetch system scans (might need index)', err);
        setScanFetchError(err.message || String(err));
      }

      const settingsDoc = await getDoc(doc(db, 'global', 'settings'));
      if (settingsDoc.exists()) {
        const d = settingsDoc.data();
        setGlobalPageLimit(d.defaultPageLimit || 100);
        setGlobalDefaultCredits(d.defaultCredits || 100);
        if (d.modelSettings) {
          setModelSettings({
            ocrProvider: d.modelSettings.ocrProvider || 'vision',
            intelligenceProvider: d.modelSettings.intelligenceProvider || 'gemini',
            geminiModel: d.modelSettings.geminiModel || 'flash',
            deepseekModel: d.modelSettings.deepseekModel || 'deepseek-v4-pro',
            zaiModel: d.modelSettings.zaiModel || 'glm-5.1'
          });
        }
      }
    } catch (e) {
      console.error('Fetch failed', e);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreScans = async () => {
    if (!hasMoreScans || loadingMoreScans || !lastScanDoc) return;
    setLoadingMoreScans(true);
    try {
      const { collectionGroup, query, orderBy, limit, startAfter, getDocs } = await import('firebase/firestore');
      const db = await import('../lib/firebase').then(m => m.db);
      
      const scansQuery = query(
        collectionGroup(db, 'invoices'), 
        orderBy('createdAt', 'desc'), 
        startAfter(lastScanDoc),
        limit(50)
      );
      const scansSnap = await getDocs(scansQuery);
      
      const newScans = scansSnap.docs.map(d => ({ 
        id: d.id, 
        pharmacyId: d.ref.parent.parent?.id || 'Unknown',
        ...d.data() 
      } as Invoice));
      
      setSystemScans(prev => [...prev, ...newScans]);
      setLastScanDoc(scansSnap.docs[scansSnap.docs.length - 1] || null);
      setHasMoreScans(scansSnap.docs.length === 50);
    } catch (err) {
      console.error('Failed to load more scans', err);
    } finally {
      setLoadingMoreScans(false);
    }
  };

  const toggleUserActive = async (targetUid: string, currentStatus: boolean) => {
    try {
      const auth = await import('../lib/firebase').then(m => m.auth);
      const token = await auth.currentUser?.getIdToken();
      
      const res = await fetch('https://asia-south2-skanifyrx.cloudfunctions.net/adminToggleUserActive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUid, active: !currentStatus })
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => 
          u.uid === targetUid 
            ? { ...u, active: data.active, credits: data.credits ?? u.credits } 
            : u
        ));
        toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'}`);
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const saveGlobalSettings = async () => {
    try {
      const auth = await import('../lib/firebase').then(m => m.auth);
      const token = await auth.currentUser?.getIdToken();
      
      const res = await fetch('https://asia-south2-skanifyrx.cloudfunctions.net/adminUpdateGlobalSettings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          defaultPageLimit: globalPageLimit,
          defaultCredits: globalDefaultCredits,
          modelSettings 
        })
      });

      if (res.ok) {
        toast.success('Global settings saved');
      } else {
        throw new Error('Failed');
      }
    } catch (e) {
      toast.error('Failed to save settings');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[var(--color-primary)]"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Manage users, credits, and global system settings.</p>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${activeTab === 'users' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
          >
            <UsersIcon className={`mr-2 h-5 w-5 ${activeTab === 'users' ? 'text-[var(--color-primary)]' : 'text-slate-400 group-hover:text-slate-500'}`} />
            Users
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${activeTab === 'settings' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
          >
            <CogIcon className={`mr-2 h-5 w-5 ${activeTab === 'settings' ? 'text-[var(--color-primary)]' : 'text-slate-400 group-hover:text-slate-500'}`} />
            Settings
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${activeTab === 'usage' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
          >
            <ChartBarIcon className={`mr-2 h-5 w-5 ${activeTab === 'usage' ? 'text-[var(--color-primary)]' : 'text-slate-400 group-hover:text-slate-500'}`} />
            Usage Overview
          </button>
        </nav>
      </div>

      {activeTab === 'users' && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Credits</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase">Total Scans</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-900 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {users.map((u) => (
                <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                        {(u.displayName || u.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-slate-900">{u.displayName || u.phoneNumber || 'User'}</div>
                        <div className="text-sm text-slate-500">{u.email || u.uid}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${u.role === 'admin' ? 'bg-purple-50 text-purple-700 ring-purple-600/20' : 'bg-slate-50 text-slate-600 ring-slate-500/10'}`}>
                      {u.role === 'admin' && <ShieldExclamationIcon className="mr-1 h-3 w-3" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${u.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{u.credits}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {u.totalScans}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => setTopUpUser({ id: u.uid, name: u.displayName || u.phoneNumber || 'User' })}
                        className="text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] flex items-center gap-1"
                      >
                        <BanknotesIcon className="h-4 w-4" />
                        <span>Top Up</span>
                      </button>
                      <button
                        onClick={() => toggleUserActive(u.uid, u.active)}
                        className={`${u.active ? 'text-rose-600 hover:text-rose-800' : 'text-emerald-600 hover:text-emerald-800'} flex items-center gap-1`}
                      >
                        {u.active ? <XCircleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                        <span>{u.active ? 'Suspend' : 'Activate'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Global Quota Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Default Credits for New Users</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={globalDefaultCredits}
                    onChange={(e) => setGlobalDefaultCredits(parseInt(e.target.value) || 0)}
                    className="block w-full max-w-[200px] rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  <span className="text-sm text-slate-500">pages</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Credits given automatically when an account is activated for the first time.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Default Monthly Limit</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={globalPageLimit}
                    onChange={(e) => setGlobalPageLimit(parseInt(e.target.value) || 0)}
                    className="block w-full max-w-[200px] rounded-xl border border-slate-300 px-4 py-2 outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  <span className="text-sm text-slate-500">pages / month</span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={saveGlobalSettings}
                  className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-dark)]"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
          
          {/* Model settings */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
             <h3 className="text-lg font-semibold text-slate-900 mb-4">AI Model Settings</h3>
             
             <div className="space-y-6">
               <div>
                 <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Text Extraction (OCR)</h4>
                 <div className="space-y-3">
                   <label className="flex items-start gap-3 cursor-pointer">
                     <input
                       type="radio"
                       name="ocrProvider"
                       value="vision"
                       checked={modelSettings.ocrProvider === 'vision'}
                       onChange={() => setModelSettings({...modelSettings, ocrProvider: 'vision'})}
                       className="mt-1"
                     />
                     <div>
                       <p className="text-sm font-medium text-slate-900">Google Vision API <span className="ml-2 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">Recommended</span></p>
                       <p className="text-xs text-slate-500">Highest accuracy for printed text and handwriting.</p>
                     </div>
                   </label>
                   <label className="flex items-start gap-3 cursor-pointer">
                     <input
                       type="radio"
                       name="ocrProvider"
                       value="z_ai"
                       checked={modelSettings.ocrProvider === 'z_ai'}
                       onChange={() => setModelSettings({...modelSettings, ocrProvider: 'z_ai'})}
                       className="mt-1"
                     />
                     <div>
                       <p className="text-sm font-medium text-slate-900">Z.ai GLM-OCR <span className="ml-2 inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs font-semibold text-purple-700">New</span></p>
                       <p className="text-xs text-slate-500">Dedicated layout parsing model.</p>
                     </div>
                   </label>
                   <label className="flex items-start gap-3 cursor-pointer">
                     <input
                       type="radio"
                       name="ocrProvider"
                       value="tesseract"
                       checked={modelSettings.ocrProvider === 'tesseract'}
                       onChange={() => setModelSettings({...modelSettings, ocrProvider: 'tesseract'})}
                       className="mt-1"
                     />
                     <div>
                       <p className="text-sm font-medium text-slate-900">Tesseract (Local)</p>
                       <p className="text-xs text-slate-500">Free and unlimited, lower accuracy.</p>
                     </div>
                   </label>
                 </div>
               </div>

               <div>
                 <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Data Structuring (AI)</h4>
                 <div className="space-y-3">
                   <label className="flex items-start gap-3 cursor-pointer">
                     <input
                       type="radio"
                       name="intelProvider"
                       value="gemini"
                       checked={modelSettings.intelligenceProvider === 'gemini'}
                       onChange={() => setModelSettings({...modelSettings, intelligenceProvider: 'gemini'})}
                       className="mt-1"
                     />
                     <div>
                       <p className="text-sm font-medium text-slate-900">Google Gemini</p>
                       <p className="text-xs text-slate-500">Fast, reliable JSON extraction.</p>
                     </div>
                   </label>
                   
                   {modelSettings.intelligenceProvider === 'gemini' && (
                     <div className="mt-2 ml-6 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                       <label className="flex items-start gap-3 cursor-pointer">
                         <input type="radio" value="flash" checked={modelSettings.geminiModel === 'flash'} onChange={() => setModelSettings({...modelSettings, geminiModel: 'flash'})} className="mt-0.5" />
                         <div><p className="text-sm font-medium text-slate-900">Best Accuracy (Flash)</p></div>
                       </label>
                       <label className="flex items-start gap-3 cursor-pointer">
                         <input type="radio" value="flash-nothink" checked={modelSettings.geminiModel === 'flash-nothink'} onChange={() => setModelSettings({...modelSettings, geminiModel: 'flash-nothink'})} className="mt-0.5" />
                         <div><p className="text-sm font-medium text-slate-900">Balanced</p></div>
                       </label>
                       <label className="flex items-start gap-3 cursor-pointer">
                         <input type="radio" value="flash-lite" checked={modelSettings.geminiModel === 'flash-lite'} onChange={() => setModelSettings({...modelSettings, geminiModel: 'flash-lite'})} className="mt-0.5" />
                         <div><p className="text-sm font-medium text-slate-900">Budget (Flash-Lite)</p></div>
                       </label>
                     </div>
                   )}

                   <label className="flex items-start gap-3 cursor-pointer">
                     <input
                       type="radio"
                       name="intelProvider"
                       value="deepseek"
                       checked={modelSettings.intelligenceProvider === 'deepseek'}
                       onChange={() => setModelSettings({...modelSettings, intelligenceProvider: 'deepseek'})}
                       className="mt-1"
                     />
                     <div>
                       <p className="text-sm font-medium text-slate-900">DeepSeek AI</p>
                       <p className="text-xs text-slate-500">Powerful chain-of-thought models.</p>
                     </div>
                   </label>

                   {modelSettings.intelligenceProvider === 'deepseek' && (
                     <div className="mt-2 ml-6 space-y-2 rounded-lg border border-purple-200 bg-purple-50 p-4">
                       <label className="flex items-start gap-3 cursor-pointer">
                         <input type="radio" value="deepseek-v4-pro" checked={modelSettings.deepseekModel === 'deepseek-v4-pro'} onChange={() => setModelSettings({...modelSettings, deepseekModel: 'deepseek-v4-pro'})} className="mt-0.5" />
                         <div><p className="text-sm font-medium text-slate-900">V4 Pro <span className="ml-1 text-xs text-slate-500">(Thinking)</span></p></div>
                       </label>
                       <label className="flex items-start gap-3 cursor-pointer">
                         <input type="radio" value="deepseek-chat" checked={modelSettings.deepseekModel === 'deepseek-chat'} onChange={() => setModelSettings({...modelSettings, deepseekModel: 'deepseek-chat'})} className="mt-0.5" />
                         <div><p className="text-sm font-medium text-slate-900">Chat <span className="ml-1 text-xs text-slate-500">(Fast/V3)</span></p></div>
                       </label>
                       <label className="flex items-start gap-3 cursor-pointer">
                         <input type="radio" value="deepseek-reasoner" checked={modelSettings.deepseekModel === 'deepseek-reasoner'} onChange={() => setModelSettings({...modelSettings, deepseekModel: 'deepseek-reasoner'})} className="mt-0.5" />
                         <div><p className="text-sm font-medium text-slate-900">Reasoner <span className="ml-1 text-xs text-slate-500">(R1)</span></p></div>
                       </label>
                     </div>
                   )}
                 </div>
               </div>
               
               <div className="pt-4 border-t border-slate-100">
                 <button
                   onClick={saveGlobalSettings}
                   className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-dark)]"
                 >
                   Save AI Settings
                 </button>
               </div>
               {hasMoreScans && (
                 <div className="flex justify-center p-6 border-t border-slate-200">
                   <button
                     onClick={loadMoreScans}
                     disabled={loadingMoreScans}
                     className="rounded-xl border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-all"
                   >
                     {loadingMoreScans ? 'Loading...' : 'Load More'}
                   </button>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {activeTab === 'usage' && (
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Usage Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-sm font-medium text-slate-500">Total System Scans</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {users.reduce((acc, u) => acc + (u.totalScans || 0), 0)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-sm font-medium text-slate-500">Active Users</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {users.filter(u => u.active).length} / {users.length}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-sm font-medium text-slate-500">Total Outstanding Credits</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {users.reduce((acc, u) => acc + (u.credits || 0), 0)}
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h4 className="text-md font-semibold text-slate-900 mb-4">Recent Scans Usage Breakdown</h4>
            
            {scanFetchError && (
              <div className="mb-4 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800 break-words">
                <p className="font-semibold mb-1">Could not load recent scans (Missing Firestore Index)</p>
                <p>Firebase requires a composite index to run this query. Open the browser console (F12) to find the direct clickable link to generate this index, or use this error detail:</p>
                <code className="block mt-2 text-xs bg-yellow-100 p-2 rounded">{scanFetchError}</code>
              </div>
            )}

            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Scan ID</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Pharmacy ID</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Uploaded By</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Total Cost</th>
                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {systemScans.map((scan) => (
                    <React.Fragment key={scan.id}>
                      <tr className={expandedScanId === scan.id ? 'bg-slate-50' : ''}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">{scan.id.slice(0, 8)}...</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{scan.pharmacyId}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {scan.uploadedByName ? (
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                              {scan.uploadedByName}
                            </span>
                          ) : 'Unknown'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {scan.createdAt ? new Date((scan.createdAt as any).toDate ? (scan.createdAt as any).toDate() : scan.createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${scan.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {scan.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium text-gray-900">
                          ${(scan.usageMetrics?.totalCost || 0).toFixed(4)}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <button
                            onClick={() => setExpandedScanId(expandedScanId === scan.id ? null : scan.id)}
                            className="text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
                          >
                            {expandedScanId === scan.id ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                          </button>
                        </td>
                      </tr>
                      {expandedScanId === scan.id && (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 bg-slate-50 border-t border-slate-200">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 mb-1">Input Tokens</p>
                                <p className="text-lg font-bold text-slate-800">{scan.usageMetrics?.inputTokens?.toLocaleString() || '0'}</p>
                              </div>
                              <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 mb-1">Output Tokens</p>
                                <p className="text-lg font-bold text-slate-800">{scan.usageMetrics?.outputTokens?.toLocaleString() || '0'}</p>
                              </div>
                              <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 mb-1">LLM Cost</p>
                                <p className="text-lg font-bold text-slate-800">${(scan.usageMetrics?.llmCost || 0).toFixed(4)}</p>
                              </div>
                              <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 mb-1">Vision Cost</p>
                                <p className="text-lg font-bold text-slate-800">${(scan.usageMetrics?.visionCost || 0).toFixed(4)}</p>
                              </div>
                              <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                <p className="text-xs text-slate-500 mb-1">Storage Cost</p>
                                <p className="text-lg font-bold text-slate-800">${(scan.usageMetrics?.storageCost || 0).toFixed(4)}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {systemScans.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-gray-500">
                        No recent scans found. (If you just deployed this, you may need to wait for a new scan or build the Firestore Index.)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <TopUpModal 
        isOpen={!!topUpUser} 
        onClose={() => setTopUpUser(null)} 
        userId={topUpUser?.id || ''} 
        userName={topUpUser?.name || ''} 
        onSuccess={fetchData} 
      />
    </div>
  );
}
