import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthContext } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { updateProfile } from 'firebase/auth';
import { getApiUrl } from '../lib/api';
import { toast } from 'react-hot-toast';
import { bustDrugMasterCache } from './MasterPage';
import type { VisionApiMode, GeminiModel, OcrProvider, IntelligenceProvider, ZaiModel } from '../types';
type DeepSeekModel = 'deepseek-v4-pro' | 'deepseek-chat' | 'deepseek-reasoner';

interface PharmacyData {
  name: string;
  drugLicenseNo: string;
  gstin: string;
  memberCount: number;
  settings: { 
    visionApiMode: VisionApiMode; 
    ocrProvider?: OcrProvider; 
    intelligenceProvider?: IntelligenceProvider; 
    geminiModel?: GeminiModel; 
    deepseekModel?: DeepSeekModel; 
    zaiModel?: ZaiModel; 
  };
}

export function SettingsPage() {
  const { user, userProfile } = useAuthContext();
  const [pharmacy, setPharmacy] = useState<PharmacyData | null>(null);
  const [loading, setLoading] = useState(true);

  const [drugImporting, setDrugImporting] = useState(false);
  const [drugImportMsg, setDrugImportMsg] = useState('');

  const [editingPharmacy, setEditingPharmacy] = useState(false);
  const [pharmacyForm, setPharmacyForm] = useState({ name: '', drugLicenseNo: '', gstin: '' });
  const [savingPharmacy, setSavingPharmacy] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Load pharmacy data
  useEffect(() => {
    if (!user?.pharmacyId) {
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'pharmacies', user.pharmacyId);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PharmacyData;
        setPharmacy(data);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [user?.pharmacyId]);

  const getToken = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not authenticated');
    return currentUser.getIdToken();
  };

  const handleEditPharmacy = () => {
    setPharmacyForm({
      name: pharmacy?.name || '',
      drugLicenseNo: pharmacy?.drugLicenseNo || '',
      gstin: pharmacy?.gstin || ''
    });
    setEditingPharmacy(true);
  };

  const handleSavePharmacy = async () => {
    if (!user?.pharmacyId) return;
    setSavingPharmacy(true);
    try {
      await updateDoc(doc(db, 'pharmacies', user.pharmacyId), {
        name: pharmacyForm.name,
        drugLicenseNo: pharmacyForm.drugLicenseNo,
        gstin: pharmacyForm.gstin
      });
      toast.success('Pharmacy updated');
      setEditingPharmacy(false);
    } catch (err) {
      toast.error('Failed to update pharmacy');
    }
    setSavingPharmacy(false);
  };

  const handleEditProfile = () => {
    setProfileName(user?.displayName || '');
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!user?.uid) return;
    setSavingProfile(true);
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: profileName });
      }
      await updateDoc(doc(db, 'users', user.uid), { displayName: profileName });
      toast.success('Profile updated');
      setEditingProfile(false);
    } catch (err) {
      toast.error('Failed to update profile');
    }
    setSavingProfile(false);
  };


  const handleDrugImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDrugImporting(true);
    setDrugImportMsg('');

    try {
      const text = await file.text();
      // Normalize line endings then split
      const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const lines = rawLines.filter((l) => l.trim());

      if (lines.length < 2) {
        throw new Error('CSV must have a header row and at least one drug');
      }

      // RFC 4180-compliant CSV parser — handles quoted fields with commas
      const parseCSVLine = (line: string): string[] => {
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
          } else if (ch === ',' && !inQuotes) {
            cols.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        cols.push(current.trim());
        return cols;
      };

      // Parse CSV header (case-insensitive, strip BOM)
      const headerLine = lines[0].replace(/^\uFEFF/, ''); // strip BOM
      const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const nameIdx = headers.findIndex((h) => ['name', 'drugname', 'drug_name', 'medicine', 'medicinename', 'product'].includes(h));
      if (nameIdx === -1) throw new Error('CSV must have a "name" or "drug name" column');

      const mfgIdx = headers.findIndex((h) => ['manufacturer', 'mfg', 'company', 'brand'].includes(h));
      const hsnIdx = headers.findIndex((h) => ['hsn', 'hsncode', 'hsn_code'].includes(h));
      const gstIdx = headers.findIndex((h) => ['gst', 'gstpct', 'gst%', 'gst_pct', 'tax'].includes(h));
      const packIdx = headers.findIndex((h) => ['pack', 'packsize', 'pack_size', 'packing'].includes(h));

      const drugs = lines.slice(1).map((line) => {
        const cols = parseCSVLine(line);
        return {
          name: cols[nameIdx] || '',
          manufacturer: mfgIdx >= 0 ? (cols[mfgIdx] || undefined) : undefined,
          hsnCode: hsnIdx >= 0 ? (cols[hsnIdx] || undefined) : undefined,
          gstPct: gstIdx >= 0 ? (parseFloat(cols[gstIdx]) || undefined) : undefined,
          packSize: packIdx >= 0 ? (cols[packIdx] || undefined) : undefined,
        };
      }).filter((d) => d.name && d.name.length > 1);

      if (drugs.length === 0) throw new Error('No valid drugs found in CSV');

      setDrugImportMsg(`Uploading ${drugs.length} drugs...`);

      const token = await getToken();
      // Upload in chunks of 2000 to handle large catalogs
      const CHUNK_SIZE = 2000;
      let totalImported = 0;
      let totalSkipped = 0;
      for (let i = 0; i < drugs.length; i += CHUNK_SIZE) {
        const chunk = drugs.slice(i, i + CHUNK_SIZE);
        const res = await fetch(getApiUrl('importDrugs'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ drugs: chunk }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Import failed');
        totalImported += data.imported || 0;
        totalSkipped += data.skipped || 0;
        setDrugImportMsg(`Uploading... ${Math.min(i + CHUNK_SIZE, drugs.length)} / ${drugs.length} processed`);
      }

      setDrugImportMsg(`✓ Imported ${totalImported} drugs (${totalSkipped} skipped as duplicates)`);
      // Bust frontend drug master cache so MasterPage re-fetches with new drugs
      if (user?.pharmacyId) bustDrugMasterCache(user.pharmacyId);
    } catch (err) {
      setDrugImportMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setDrugImporting(false);
      e.target.value = ''; // Reset file input
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Settings</h1>

      {/* Pharmacy Info */}
      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Pharmacy
          </h2>
          {!editingPharmacy && (
            <button onClick={handleEditPharmacy} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]">
              Edit
            </button>
          )}
        </div>
        <div className="space-y-3 text-sm">
          {editingPharmacy ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input type="text" value={pharmacyForm.name} onChange={e => setPharmacyForm({...pharmacyForm, name: e.target.value})} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Drug License</label>
                <input type="text" value={pharmacyForm.drugLicenseNo} onChange={e => setPharmacyForm({...pharmacyForm, drugLicenseNo: e.target.value})} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">GSTIN</label>
                <input type="text" value={pharmacyForm.gstin} onChange={e => setPharmacyForm({...pharmacyForm, gstin: e.target.value})} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditingPharmacy(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button onClick={handleSavePharmacy} disabled={savingPharmacy} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                  {savingPharmacy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{pharmacy?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Drug License</span>
                <span className="font-medium text-gray-900">{pharmacy?.drugLicenseNo || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">GSTIN</span>
                <span className="font-medium text-gray-900">{pharmacy?.gstin || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Team members</span>
                <span className="font-medium text-gray-900">{pharmacy?.memberCount || 1}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* User Profile */}
      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Your Profile
          </h2>
          {!editingProfile && (
            <button onClick={handleEditProfile} className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]">
              Edit
            </button>
          )}
        </div>
        <div className="space-y-3 text-sm">
          {editingProfile ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} className="w-full rounded-lg border border-gray-300 p-2 text-sm" />
              </div>
              <div className="flex justify-between items-center opacity-70">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900">{user?.email || '—'}</span>
              </div>
              <div className="flex justify-between items-center opacity-70">
                <span className="text-gray-500">Your role</span>
                <span className="font-medium text-gray-900 capitalize">{userProfile?.role || 'user'}</span>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditingProfile(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button onClick={handleSaveProfile} disabled={savingProfile} className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50">
                  {savingProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{user?.displayName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium text-gray-900">{user?.email || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Your role</span>
                <span className="font-medium text-gray-900 capitalize">{userProfile?.role || 'user'}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Drug Master Import (all users) */}
      {(userProfile?.role === 'user' || userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Drug Master Data
          </h2>
          <p className="mb-3 text-xs text-gray-500">
            Import your existing drug list as CSV. Required column: <strong>name</strong>.
            Optional: manufacturer, hsn, gst, pack.
          </p>
          <div className="mb-4 mt-2 flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="text-xs text-gray-600">
              Need a starting point? Download our CSV template.
            </div>
            <button 
              onClick={() => {
                const csvContent = "name,manufacturer,hsn,gst,pack\nParacetamol 500mg,Cipla,3004,12,10x10\nAmoxicillin 250mg,Sun Pharma,3004,12,10s";
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute("download", "drug_master_template.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] bg-white border border-gray-200 rounded px-2 py-1"
            >
              Download Template
            </button>
          </div>
          <label className="block mt-4">
            <span className="sr-only">Upload drug CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleDrugImport}
              disabled={drugImporting}
              className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[var(--color-primary-dark)] disabled:opacity-50 file:cursor-pointer file:transition-colors"
            />
          </label>
          {drugImporting && (
            <p className="mt-2 text-sm text-gray-500 animate-pulse">Importing...</p>
          )}
          {drugImportMsg && (
            <p className={`mt-2 text-sm ${drugImportMsg.includes('failed') || drugImportMsg.includes('error') || drugImportMsg.includes('must') ? 'text-red-600' : 'text-green-600'}`}>
              {drugImportMsg}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
