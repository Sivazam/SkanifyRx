import { useEffect, useState, useMemo, useCallback } from 'react';
import { collection, getDocs, doc, deleteDoc, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

interface DrugEntry {
  id: string;
  drugName: string;
  aliases: string[];
  hsnCode: string;
  defaultGstPct: number;
  manufacturer: string;
}

// ─── Module-level browser cache ──────────────────────────────────────────────
// Lives outside the component so it persists across navigation and remounts.
// Firestore is only queried once per pharmacy per browser session (or when stale).
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const drugMasterCache: Map<string, { drugs: DrugEntry[]; loadedAt: number }> = new Map();

function getCachedDrugs(pharmacyId: string): DrugEntry[] | null {
  const cached = drugMasterCache.get(pharmacyId);
  if (!cached) return null;
  if (Date.now() - cached.loadedAt > CACHE_TTL_MS) {
    drugMasterCache.delete(pharmacyId); // Stale — evict
    return null;
  }
  return cached.drugs;
}

function setCachedDrugs(pharmacyId: string, drugs: DrugEntry[]) {
  drugMasterCache.set(pharmacyId, { drugs, loadedAt: Date.now() });
}

// Allow other modules (e.g., after a new import) to bust the cache
export function bustDrugMasterCache(pharmacyId: string) {
  drugMasterCache.delete(pharmacyId);
}
// ─────────────────────────────────────────────────────────────────────────────


export function MasterPage() {
  const { user } = useAuth();
  const pharmacyId = user?.pharmacyId;
  const [allDrugs, setAllDrugs] = useState<DrugEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(50);

  // Load ALL drugs — served from module-level cache if fresh, Firestore only on first load or after 5 min
  const fetchAllDrugs = useCallback(async (forceRefresh = false) => {
    if (!pharmacyId) return;

    // Serve from cache if available and not forcing refresh
    if (!forceRefresh) {
      const cached = getCachedDrugs(pharmacyId);
      if (cached) {
        setAllDrugs(cached);
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'pharmacies', pharmacyId, 'drugMaster'),
        orderBy('drugName'),
      );
      const snapshot = await getDocs(q);
      const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DrugEntry));
      setCachedDrugs(pharmacyId, fetched); // Store in module-level cache
      setAllDrugs(fetched);
    } catch (error) {
      console.error('Error fetching drug master:', error);
    } finally {
      setLoading(false);
    }
  }, [pharmacyId]);

  useEffect(() => {
    fetchAllDrugs();
  }, [fetchAllDrugs]);

  const handleDelete = async (id: string) => {
    if (!pharmacyId) return;
    if (confirm('Are you sure you want to delete this drug?')) {
      try {
        await deleteDoc(doc(db, 'pharmacies', pharmacyId, 'drugMaster', id));
        const updated = allDrugs.filter(d => d.id !== id);
        setAllDrugs(updated);
        setCachedDrugs(pharmacyId, updated); // Keep cache in sync
      } catch (error) {
        console.error('Error deleting drug:', error);
      }
    }
  };

  // Full-catalog fuzzy search across ALL loaded drugs
  const filteredDrugs = useMemo(() => {
    if (!searchTerm.trim()) return allDrugs;
    const q = searchTerm.toLowerCase();
    return allDrugs.filter(d =>
      d.drugName?.toLowerCase().includes(q) ||
      d.manufacturer?.toLowerCase().includes(q) ||
      d.hsnCode?.toLowerCase().includes(q) ||
      d.aliases?.some(a => a.toLowerCase().includes(q))
    );
  }, [allDrugs, searchTerm]);

  // For performance: paginate the *filtered* view for large catalogs
  const visibleDrugs = useMemo(() => filteredDrugs.slice(0, displayCount), [filteredDrugs, displayCount]);
  const hasMore = filteredDrugs.length > displayCount;

  // Reset display count when search term changes
  useEffect(() => {
    setDisplayCount(50);
  }, [searchTerm]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Drug Master Catalog</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {loading
              ? 'Loading catalog...'
              : `${allDrugs.length.toLocaleString()} drugs · ${getCachedDrugs(pharmacyId ?? '') ? 'served from cache' : 'loaded from database'}`}
          </p>
        </div>
        <button
          onClick={() => fetchAllDrugs(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 transition-all"
          title="Force reload from Firestore"
        >
          <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input 
          type="text" 
          placeholder="Search all drugs by name, alias, HSN, or manufacturer..." 
          className="block w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-4 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all duration-200"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <span className="text-xs text-zinc-400 font-medium">
              {filteredDrugs.length} result{filteredDrugs.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 md:hidden gap-4">
        {visibleDrugs.map((drug) => (
          <div key={drug.id} className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start gap-2">
              <span className="font-semibold text-zinc-900 break-words flex-1">{drug.drugName}</span>
              <button 
                onClick={() => handleDelete(drug.id)}
                className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded-md bg-red-50 shrink-0 mt-0.5"
              >
                Delete
              </button>
            </div>
            
            {drug.manufacturer && (
              <p className="text-xs text-zinc-500">{drug.manufacturer}</p>
            )}
            
            <div>
              <p className="text-xs text-zinc-500 mb-1.5 uppercase font-semibold">Learned Aliases</p>
              {drug.aliases?.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {drug.aliases.map((alias, i) => (
                    <span key={i} className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 break-all">
                      {alias}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-zinc-400 text-xs italic">No aliases learned yet</span>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 mt-1 border-t border-zinc-100">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-semibold">HSN</p>
                <p className="text-sm text-zinc-800 font-mono">{drug.hsnCode || '-'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 uppercase font-semibold">GST %</p>
                <p className="text-sm text-zinc-800 font-mono">{drug.defaultGstPct ? `${drug.defaultGstPct}%` : '-'}</p>
              </div>
            </div>
          </div>
        ))}

        {!loading && filteredDrugs.length === 0 && (
          <div className="p-8 text-center bg-white rounded-xl border border-zinc-200 shadow-sm">
            <p className="text-sm text-zinc-500">No drugs found matching "{searchTerm}".</p>
            <p className="text-xs text-zinc-400 mt-1">Try a different spelling or partial name.</p>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50/80 backdrop-blur-sm">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Drug Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Manufacturer</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider w-1/4">Aliases (Learned)</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">HSN</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">GST %</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {visibleDrugs.map((drug) => (
                <tr key={drug.id} className="hover:bg-zinc-50/50 transition-colors duration-150">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-semibold text-zinc-900">{drug.drugName}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                    {drug.manufacturer || <span className="text-zinc-300 italic">-</span>}
                  </td>
                  <td className="px-6 py-4">
                    {drug.aliases?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {drug.aliases.map((alias, i) => (
                          <span key={i} className="inline-flex items-center rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200/50 transition-colors hover:bg-zinc-200">
                            {alias}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-zinc-400 text-sm italic">No aliases yet</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 font-mono">
                    {drug.hsnCode || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600 font-mono">
                    {drug.defaultGstPct ? `${drug.defaultGstPct}%` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button 
                      onClick={() => handleDelete(drug.id)}
                      className="text-red-500 hover:text-red-700 font-medium transition-colors"
                      title="Delete drug entry"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              
              {!loading && filteredDrugs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-500">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <svg className="h-10 w-10 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p>No drugs found matching "{searchTerm}".</p>
                      <p className="text-xs text-zinc-400">Try a different spelling, partial name, or HSN code.</p>
                    </div>
                  </td>
                </tr>
              )}
              
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-500">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="animate-spin h-5 w-5 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Loading catalog ({allDrugs.length.toLocaleString()} drugs so far)...</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Load more visible rows (not more data — data is already all loaded) */}
      {hasMore && !loading && (
        <div className="flex flex-col items-center gap-1 pb-8">
          <button 
            onClick={() => setDisplayCount(c => c + 100)}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200 transition-all active:scale-[0.98]"
          >
            Show More ({filteredDrugs.length - displayCount} remaining)
          </button>
          <p className="text-xs text-zinc-400">
            Showing {displayCount} of {filteredDrugs.length.toLocaleString()}
            {searchTerm ? ' filtered results' : ' total drugs'}
          </p>
        </div>
      )}
    </div>
  );
}
