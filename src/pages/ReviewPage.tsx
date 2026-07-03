import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, auth, storage } from '../lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { useAuthContext } from '../context/AuthContext';
import { useInvoice } from '../hooks/useInvoice';
import { CardSkeleton } from '../components/Skeleton';
import { downloadCSV, copyCSVToClipboard } from '../lib/csvExport';
import { getApiUrl } from '../lib/api';
import type { LineItem, Invoice } from '../types';

// ── Helpers ──────────────────────────────────────────────

/** Renders invoice-level validation warnings */
function InvoiceWarnings({ invoice }: { invoice: Invoice }) {
  const raw = (invoice as unknown as Record<string, unknown>)['invoiceWarnings'];
  if (!raw || !Array.isArray(raw)) return null;
  const warnings = raw as Array<{ field: string; message: string; severity: string }>;
  return (
    <>
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`mb-2 rounded-lg px-4 py-2 text-sm ${
            w.severity === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-yellow-50 text-yellow-700'
          }`}
        >
          {w.message}
        </div>
      ))}
    </>
  );
}


function getConfidenceBadge(score: number) {
  if (score >= 90) return 'bg-green-100 text-green-800';
  if (score >= 70) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

function getFieldColor(
  fieldConfidences: Partial<Record<string, number>> | undefined,
  field: string,
): string {
  if (!fieldConfidences) return '';
  const conf = fieldConfidences[field];
  if (conf === undefined) return '';
  if (conf >= 90) return 'bg-green-50';
  if (conf >= 70) return 'bg-yellow-50';
  return 'bg-red-50';
}

/** Editable fields in a line item */
const EDITABLE_FIELDS = [
  { key: 'drugName', label: 'Drug Name', type: 'text' },
  { key: 'productCode', label: 'Product Code', type: 'text' },
  { key: 'packing', label: 'Packing', type: 'text' },
  { key: 'batchNo', label: 'Batch No', type: 'text' },
  { key: 'expiryDate', label: 'Expiry', type: 'text' },
  { key: 'mrp', label: 'MRP (₹)', type: 'number' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'freeQty', label: 'Free', type: 'number' },
  { key: 'rate', label: 'PTS (₹)', type: 'number' },
  { key: 'ptrPts', label: 'PTR (₹)', type: 'number' },
  { key: 'discountPct', label: 'Disc%', type: 'number' },
  { key: 'gstPct', label: 'GST%', type: 'number' },
  { key: 'netAmount', label: 'Taxable Amt (₹)', type: 'number' },
  { key: 'totalAmount', label: 'Total (₹)', type: 'number' },
  { key: 'hsnCode', label: 'HSN', type: 'text' },
] as const;

// ── Compact Line Item Card ──────────────────────────────
function CompactLineItemCard({
  item,
  index,
  edits,
  onFieldChange,
}: {
  item: LineItem;
  index: number;
  edits: Record<string, string>;
  onFieldChange: (itemId: string, field: string, value: string) => void;
}) {
  const suggested = (item as any)['suggestedDrugName'];
  
  const warnings: Array<{ field: string; message: string; severity: string }> =
    (item as unknown as Record<string, unknown>)['validationWarnings'] as Array<{
      field: string;
      message: string;
      severity: string;
    }> ?? [];

  // Determine card base colors based on confidence
  let cardBgClass = '';
  let headerBgClass = '';
  if (item.confidenceScore >= 90) {
    cardBgClass = 'border-green-200 bg-green-50/20';
    headerBgClass = 'bg-green-50/80 border-green-200';
  } else if (item.confidenceScore >= 70) {
    cardBgClass = 'border-yellow-300 bg-yellow-50/20 shadow-yellow-100/50';
    headerBgClass = 'bg-yellow-50/80 border-yellow-200';
  } else {
    cardBgClass = 'border-red-300 bg-red-50/20 shadow-red-100/50';
    headerBgClass = 'bg-red-50/80 border-red-200';
  }

  // DrugName specific check
  const drugNameWarnings = warnings.filter(w => w.field === 'drugName');
  if (item.matchedDrugId === null && !drugNameWarnings.some(w => w.message.includes('not found'))) {
    drugNameWarnings.push({ field: 'drugName', message: 'Drug name not found in master', severity: 'error' });
  }

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden transition-all ${cardBgClass}`}>
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${headerBgClass}`}>
         <div className="flex items-center gap-3">
            <span className="font-semibold text-zinc-600 text-sm">Item #{index + 1}</span>
            {item.needsReview && <span className="bg-orange-100 text-orange-700 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">Needs Review</span>}
         </div>
         <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getConfidenceBadge(item.confidenceScore)}`}>
           {item.confidenceScore}% Conf
         </span>
      </div>
      <div className="p-4 flex flex-col gap-4 bg-white/60">
         {/* Drug Name Full Width */}
         <div className="flex flex-col gap-1.5">
           <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Drug Name</label>
           <div className="flex flex-col gap-1">
             <input
               type="text"
               value={edits[`${item.id}:drugName`] ?? item.drugName ?? ''}
               onChange={(e) => onFieldChange(item.id, 'drugName', e.target.value)}
               className={`w-full rounded-lg border px-3 py-2 text-sm font-medium focus:ring-1 focus:ring-zinc-900 transition-colors ${getFieldColor(item.fieldConfidences, 'drugName')} ${edits[`${item.id}:drugName`] !== undefined ? 'bg-amber-50 border-amber-300' : 'border-zinc-300'}`}
             />
             {drugNameWarnings.map((w, wi) => (
               <p key={wi} className={`mt-0.5 text-[10px] font-semibold ${w.severity === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                 {w.severity === 'error' ? '❌' : '⚠️'} {w.message}
               </p>
             ))}
             {suggested && suggested !== (edits[`${item.id}:drugName`] ?? item.drugName) && (
               <button
                 type="button"
                 onClick={() => onFieldChange(item.id, 'drugName', suggested)}
                 className="self-start text-left text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 border border-blue-200 px-2 py-1 rounded-md transition-colors"
               >
                 ✨ Use Suggestion: {suggested}
               </button>
             )}
           </div>
         </div>
         
         {/* Other Fields Grid */}
         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
           {EDITABLE_FIELDS.filter(f => f.key !== 'drugName').map(f => {
             const currentValue = edits[`${item.id}:${f.key}`] ?? (item as any)[f.key] ?? '';
             const isEdited = edits[`${item.id}:${f.key}`] !== undefined;
             const fieldWarnings = warnings.filter(w => w.field === f.key);
             
             return (
               <div key={f.key} className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider truncate" title={f.label}>{f.label}</label>
                  <input
                    type={f.type}
                    step={f.type === 'number' ? 'any' : undefined}
                    value={currentValue}
                    onChange={(e) => onFieldChange(item.id, f.key, e.target.value)}
                    className={`w-full rounded-lg border px-2 py-1.5 text-xs focus:ring-1 focus:ring-zinc-900 transition-colors ${f.type === 'number' ? 'text-right font-mono' : ''} ${getFieldColor(item.fieldConfidences, f.key)} ${isEdited ? 'bg-amber-50 border-amber-300' : 'border-zinc-300'}`}
                  />
                  {fieldWarnings.map((w, wi) => (
                    <p key={wi} className={`mt-0.5 text-[10px] font-semibold ${w.severity === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {w.severity === 'error' ? '❌' : '⚠️'} {w.message}
                    </p>
                  ))}
               </div>
             );
           })}
         </div>
      </div>
    </div>
  );
}

// ── Main Review Page ─────────────────────────────────────

// Invoice Image Viewer — fetches signed URLs and shows images
function InvoiceImageViewer({ invoice }: { invoice: Invoice }) {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const rawUrls = (invoice as unknown as Record<string, unknown>)['imageUrls'] as string[] | undefined;
    if (!rawUrls || rawUrls.length === 0) return;

    let cancelled = false;

    async function fetchDownloadUrls() {
      setLoadingImages(true);
      try {
        const urls: string[] = [];
        for (const rawUrl of rawUrls!) {
          // Extract storage path from URL
          let storagePath = rawUrl;
          if (rawUrl.startsWith('gs://')) {
            storagePath = rawUrl.replace(/^gs:\/\/[^/]+\//, '');
          } else if (rawUrl.includes('firebasestorage.googleapis.com')) {
            const match = rawUrl.match(/\/o\/(.+?)(\?|$)/);
            storagePath = match ? decodeURIComponent(match[1]) : rawUrl;
          }

          try {
            const url = await getDownloadURL(ref(storage, storagePath));
            urls.push(url);
          } catch {
            // Skip failed URLs silently
          }
        }

        if (!cancelled) setImageUrls(urls);
      } catch {
        // Ignore — images are optional
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    }

    fetchDownloadUrls();
    return () => { cancelled = true; };
  }, [invoice]);

  if (!imageUrls.length && !loadingImages) return null;

  return (
    <div className="rounded-2xl bg-white shadow-sm overflow-hidden border border-zinc-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex lg:hidden w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>📷 Original Invoice ({imageUrls.length || '...'} page{imageUrls.length !== 1 ? 's' : ''})</span>
        <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      <div className={`${expanded ? 'block' : 'hidden'} lg:block border-t lg:border-t-0 border-gray-100 p-4 space-y-3`}>
        {loadingImages && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--color-primary)]" />
            <span className="ml-2 text-sm text-gray-500">Loading images...</span>
          </div>
        )}
        {imageUrls.map((url, idx) => {
          const isPdf = url.split('?')[0].toLowerCase().endsWith('.pdf') || url.toLowerCase().includes('%2f.pdf');
          return (
            <div key={idx} className="relative">
              <p className="mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">{isPdf ? 'PDF Document' : `Page ${idx + 1}`}</p>
              {isPdf ? (
                <iframe
                  src={`${url}#view=FitH`}
                  title={`Invoice PDF`}
                  className="w-full h-[65vh] rounded-xl border border-zinc-200"
                />
              ) : (
                <img
                  src={url}
                  alt={`Invoice page ${idx + 1}`}
                  className="w-full rounded-xl border border-zinc-200"
                  loading="lazy"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const pharmacyId = user?.pharmacyId ?? null;
  const { invoice, lineItems, loading } = useInvoice(pharmacyId, invoiceId ?? null);

  // Track edits in local state (itemId:field → value)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<'good' | 'poor' | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'high' | 'medium' | 'low'>('low');
  const [hasSetInitialTab, setHasSetInitialTab] = useState(false);
  const [showImageSidebar, setShowImageSidebar] = useState(false);

  // Track invoice-level metadata edits
  const [invoiceEdits, setInvoiceEdits] = useState({
    supplierName: '',
    invoiceNumber: '',
    invoiceDate: '',
  });
  const [hasInvoiceEdits, setHasInvoiceEdits] = useState(false);

  // Mark as viewed when opened
  useEffect(() => {
    if (invoice && invoice.viewed === false && pharmacyId && invoiceId) {
      const docRef = doc(db, 'pharmacies', pharmacyId, 'invoices', invoiceId);
      updateDoc(docRef, { viewed: true }).catch(console.error);
    }
  }, [invoice?.viewed, pharmacyId, invoiceId]);

  useEffect(() => {
    if (invoice && !hasInvoiceEdits) {
      setInvoiceEdits({
        supplierName: invoice.supplierName || '',
        invoiceNumber: invoice.invoiceNumber || '',
        invoiceDate: invoice.invoiceDate || '',
      });
    }
  }, [invoice, hasInvoiceEdits]);

  const handleInvoiceEditChange = useCallback((field: string, value: string) => {
    setInvoiceEdits((prev) => ({ ...prev, [field]: value }));
    setHasInvoiceEdits(true);
  }, []);

  // Auto-set the initial tab based on highest count
  useEffect(() => {
    if (lineItems.length > 0 && !hasSetInitialTab) {
      const high = lineItems.filter((li) => li.confidenceScore >= 90).length;
      const medium = lineItems.filter((li) => li.confidenceScore >= 70 && li.confidenceScore < 90).length;
      const low = lineItems.filter((li) => li.confidenceScore < 70).length;

      if (low >= high && low >= medium) setActiveTab('low');
      else if (medium >= high && medium > low) setActiveTab('medium');
      else setActiveTab('high');
      
      setHasSetInitialTab(true);
    }
  }, [lineItems, hasSetInitialTab]);

  // Warn user about unsaved edits when leaving the page
  const hasEdits = Object.keys(edits).length > 0 || hasInvoiceEdits;
  useEffect(() => {
    if (!hasEdits) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasEdits]);

  const handleFieldChange = useCallback(
    (itemId: string, field: string, value: string) => {
      setEdits((prev) => ({ ...prev, [`${itemId}:${field}`]: value }));
    },
    [],
  );

  // Track whether pharmacist accepted all high-confidence items
  const [acceptedGreen, setAcceptedGreen] = useState(false);

  // Build line items with edits applied
  const editedLineItems = useMemo(() => {
    return lineItems.map((item) => {
      const edited = { ...item };
      let wasEdited = false;

      for (const field of EDITABLE_FIELDS) {
        const editKey = `${item.id}:${field.key}`;
        if (edits[editKey] !== undefined) {
          const val = edits[editKey];
          if (field.type === 'number') {
            (edited as Record<string, unknown>)[field.key] = parseFloat(val) || 0;
          } else {
            (edited as Record<string, unknown>)[field.key] = val;
          }
          wasEdited = true;
        }
      }

      if (wasEdited) {
        edited.wasEdited = true;
      }

      // If pharmacist accepted all green, mark high-confidence items as reviewed
      if (acceptedGreen && edited.confidenceScore >= 90) {
        edited.needsReview = false;
      }

      return edited;
    });
  }, [lineItems, edits, acceptedGreen]);

  // Stats
  const stats = useMemo(() => {
    const high = editedLineItems.filter((li) => li.confidenceScore >= 90).length;
    const medium = editedLineItems.filter(
      (li) => li.confidenceScore >= 70 && li.confidenceScore < 90,
    ).length;
    const low = editedLineItems.filter((li) => li.confidenceScore < 70).length;
    const reviewCount = editedLineItems.filter((li) => li.needsReview).length;
    return { high, medium, low, reviewCount };
  }, [editedLineItems]);

  // Accept all green (auto-mark items with score >= 90 as reviewed)
  const handleAcceptAllGreen = useCallback(() => {
    setAcceptedGreen(true);
  }, []);

  // Save edits to Firestore without exporting
  const handleSaveEdits = useCallback(async () => {
    if (!pharmacyId || !invoiceId) return;
    const editedEntries = Object.entries(edits);
    if (editedEntries.length === 0 && !hasInvoiceEdits) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);

      if (hasInvoiceEdits) {
        const invoiceRef = doc(db, 'pharmacies', pharmacyId, 'invoices', invoiceId);
        batch.update(invoiceRef, {
          supplierName: invoiceEdits.supplierName.trim() || null,
          invoiceNumber: invoiceEdits.invoiceNumber.trim() || null,
          invoiceDate: invoiceEdits.invoiceDate.trim() || null,
          updatedAt: serverTimestamp(),
        });
      }

      const itemEdits = new Map<string, Record<string, unknown>>();
      for (const [key, value] of editedEntries) {
        const [itemId, field] = key.split(':');
        const existing = itemEdits.get(itemId) ?? {};
        const fieldDef = EDITABLE_FIELDS.find((f) => f.key === field);
        existing[field] = fieldDef?.type === 'number' ? parseFloat(value) || 0 : value;
        existing['wasEdited'] = true;
        itemEdits.set(itemId, existing);
      }

      for (const [itemId, fields] of itemEdits) {
        const docRef = doc(db, 'pharmacies', pharmacyId, 'invoices', invoiceId, 'lineItems', itemId);
        batch.update(docRef, fields as Record<string, string | number | boolean>);
      }

      await batch.commit();
      setEdits({}); // Clear local edits — they're now persisted in Firestore
      setHasInvoiceEdits(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Save failed:', error);
      alert('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [pharmacyId, invoiceId, edits, hasInvoiceEdits, invoiceEdits]);

  // Confirm & Export
  const handleConfirmExport = useCallback(async () => {
    if (!pharmacyId || !invoiceId) return;

    // Check if there are unresolved red items
    const unresolvedRed = editedLineItems.filter(
      (li) => li.confidenceScore < 70 && !edits[`${li.id}:drugName`],
    );

    if (unresolvedRed.length > 0) {
      const proceed = window.confirm(
        `${unresolvedRed.length} item(s) have low confidence and haven't been reviewed. Continue anyway?`,
      );
      if (!proceed) return;
    }

    setSaving(true);

    try {
      const batch = writeBatch(db);

      // Save any edits back to the raw invoice subcollections
      const editedEntries = Object.entries(edits);
      const invoiceRef = doc(db, 'pharmacies', pharmacyId, 'invoices', invoiceId);
      const invoiceUpdates: Record<string, any> = {
        status: 'exported',
        updatedAt: serverTimestamp(),
      };
      if (hasInvoiceEdits) {
        invoiceUpdates.supplierName = invoiceEdits.supplierName.trim() || null;
        invoiceUpdates.invoiceNumber = invoiceEdits.invoiceNumber.trim() || null;
        invoiceUpdates.invoiceDate = invoiceEdits.invoiceDate.trim() || null;
      }
      batch.update(invoiceRef, invoiceUpdates);

      if (editedEntries.length > 0) {
        // Group edits by item ID
        const itemEdits = new Map<string, Record<string, unknown>>();
        for (const [key, value] of editedEntries) {
          const [itemId, field] = key.split(':');
          const existing = itemEdits.get(itemId) ?? {};
          const fieldDef = EDITABLE_FIELDS.find((f) => f.key === field);
          existing[field] =
            fieldDef?.type === 'number' ? parseFloat(value) || 0 : value;
          existing['wasEdited'] = true;
          itemEdits.set(itemId, existing);
        }

        for (const [itemId, fields] of itemEdits) {
          const lineItemRef = doc(
            db,
            'pharmacies',
            pharmacyId,
            'invoices',
            invoiceId,
            'lineItems',
            itemId,
          );
          batch.update(lineItemRef, fields as Record<string, string | number | boolean>);
        }
      }

      // Download CSV variables
      const finalSupplierName = hasInvoiceEdits ? invoiceEdits.supplierName : invoice?.supplierName;
      const finalInvoiceNumber = hasInvoiceEdits ? invoiceEdits.invoiceNumber : invoice?.invoiceNumber;
      const finalInvoiceDate = hasInvoiceEdits ? invoiceEdits.invoiceDate : invoice?.invoiceDate;

      // Business key for a purchase bill = supplier + invoice number. Namespacing by supplier
      // prevents two different suppliers that reuse the same invoice number (e.g. "001") from
      // overwriting each other. When the number is blank we fall back to the unique invoiceId
      // (re-exporting the same scan still merges; different scans no longer collide).
      const numberPart = (finalInvoiceNumber || '').trim();
      const supplierPart = (finalSupplierName || '').trim();
      const exportDocId = numberPart
        ? `${supplierPart}__${numberPart}`.replace(/[^a-zA-Z0-9-]/g, '_').replace(/_+/g, '_').slice(0, 200)
        : invoiceId;
      const exportDocRef = doc(db, 'pharmacies', pharmacyId, 'exportedInvoices', exportDocId);
      
      const cleanProducts = editedLineItems.map(li => {
        const { needsReview, confidenceScore, ocrComparison, ...rest } = li as any;
        return rest;
      });

      batch.set(exportDocRef, {
        invoiceId,
        supplierName: finalSupplierName || '',
        invoiceNumber: finalInvoiceNumber || '',
        invoiceDate: finalInvoiceDate || '',
        imageUrls: invoice?.imageUrls || [],
        totalItems: cleanProducts.length,
        products: cleanProducts,
        status: 'exported',
        exportedAt: serverTimestamp(),
      }, { merge: true });

      await batch.commit();

      const supplier = (finalSupplierName || 'Unknown').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
      const billNo = (finalInvoiceNumber || invoiceId || 'NA').replace(/[^a-zA-Z0-9-]/g, '_');
      const dateStr = finalInvoiceDate || new Date().toISOString().slice(0, 10);
      const filename = `${supplier}_${billNo}_${dateStr}.csv`;
      downloadCSV(
        editedLineItems,
        filename,
        undefined,
        { invoiceDate: finalInvoiceDate, invoiceNumber: finalInvoiceNumber },
      );

      // Auto-learn: fire-and-forget POST of edited drug names to drug master
      try {
        const drugEdits: Array<{ drugName: string; ocrComparisonText?: string; hsnCode?: string; gstPct?: number; mrp?: number }> = [];
        for (const li of lineItems) {
          const editedName = edits[`${li.id}:drugName`];
          if (editedName && editedName.trim() !== li.drugName.trim()) {
            const editedItem = editedLineItems.find((e) => e.id === li.id);
            drugEdits.push({
              drugName: editedName.trim(),
              ocrComparisonText: li.drugName, // The text Gemini/OCR originally extracted
              hsnCode: editedItem?.hsnCode || li.hsnCode,
              gstPct: editedItem?.gstPct ?? li.gstPct,
              mrp: editedItem?.mrp ?? li.mrp,
            });
          }
        }
        if (drugEdits.length > 0 && pharmacyId) {
          const token = await auth.currentUser?.getIdToken();
          fetch(getApiUrl('learnDrugEdits'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ pharmacyId, edits: drugEdits }),
          }).catch(() => {}); // fire-and-forget
        }
      } catch {
        // Don't block export on learning errors
      }

      // Show feedback prompt
      setShowFeedback(true);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [pharmacyId, invoiceId, edits, editedLineItems, invoice, hasInvoiceEdits, invoiceEdits]);

  // Submit feedback, save accuracy metrics, and mark as exported
  const handleFeedback = useCallback(
    async (fb: 'good' | 'poor' | null) => {
      if (!pharmacyId || !invoiceId) return;
      setFeedback(fb);

      // Compute accuracy metrics
      const totalFields = lineItems.length * EDITABLE_FIELDS.length;
      const editedFieldCount = Object.keys(edits).length;
      const autoCorrections = lineItems.filter(
        (li) => (li as unknown as Record<string, unknown>)['suggestedDrugName']
      ).length;
      const correctionRate =
        totalFields > 0 ? editedFieldCount / totalFields : 0;
      const highConfidenceCount = lineItems.filter(
        (li) => li.confidenceScore >= 90
      ).length;
      const lowConfidenceCount = lineItems.filter(
        (li) => li.confidenceScore < 70
      ).length;

      try {
        const invoiceRef = doc(
          db,
          'pharmacies',
          pharmacyId,
          'invoices',
          invoiceId,
        );
        await updateDoc(invoiceRef, {
          status: 'exported',
          userFeedback: fb,
          correctionRate,
          accuracyMetrics: {
            fieldsTotal: totalFields,
            fieldsEdited: editedFieldCount,
            fieldsAutoCorrect: autoCorrections,
            highConfidence: highConfidenceCount,
            lowConfidence: lowConfidenceCount,
            lineItemCount: lineItems.length,
          },
          exportedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        navigate('/');
      } catch (error) {
        console.error('Feedback save failed:', error);
        navigate('/');
      }
    },
    [pharmacyId, invoiceId, lineItems, edits, navigate],
  );

  // Copy CSV to clipboard
  const handleCopyCSV = useCallback(async () => {
    const success = await copyCSVToClipboard(editedLineItems);
    setCopySuccess(success);
    if (success) {
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [editedLineItems]);

  // ── Loading State ──────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="rounded-lg bg-white p-6 text-center shadow-sm">
        <p className="text-gray-500">Invoice not found</p>
      </div>
    );
  }

  // ── Feedback Modal ─────────────────────────────────────

  if (showFeedback) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-lg">
          <h2 className="mb-1 text-lg font-bold text-gray-900">
            CSV exported successfully!
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            How accurate was this scan?
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => handleFeedback('good')}
              className={`rounded-lg px-6 py-3 text-lg transition-colors ${
                feedback === 'good'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 hover:bg-green-50'
              }`}
            >
              Good
            </button>
            <button
              onClick={() => handleFeedback('poor')}
              className={`rounded-lg px-6 py-3 text-lg transition-colors ${
                feedback === 'poor'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 hover:bg-red-50'
              }`}
            >
              Poor
            </button>
          </div>
          <button
            onClick={() => handleFeedback(null)}
            className="mt-4 text-sm text-gray-400 underline hover:text-gray-600"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Main Review UI ─────────────────────────────────────

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm border border-zinc-200">
        <div className="flex flex-col gap-4">
          <div className="flex-1 w-full">
            <h1 className="mb-4 text-xl font-bold tracking-tight text-zinc-900">Review Invoice</h1>
            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Supplier Name</label>
                <input
                  type="text"
                  value={invoiceEdits.supplierName}
                  onChange={(e) => handleInvoiceEditChange('supplierName', e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Unknown Supplier"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Invoice No</label>
                <input
                  type="text"
                  value={invoiceEdits.invoiceNumber}
                  onChange={(e) => handleInvoiceEditChange('invoiceNumber', e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="No #"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Invoice Date</label>
                <input
                  type="text"
                  value={invoiceEdits.invoiceDate}
                  onChange={(e) => handleInvoiceEditChange('invoiceDate', e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 sm:mt-0">
            {stats.reviewCount > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 border border-amber-200">
                {stats.reviewCount} need review
              </span>
            )}
            <button
              onClick={() => setShowImageSidebar(!showImageSidebar)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:border-zinc-400 transition-all active:scale-95 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {showImageSidebar ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                )}
                {showImageSidebar && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />}
              </svg>
              {showImageSidebar ? 'Hide Image' : 'Show Image'}
            </button>
            <button
              onClick={handleCopyCSV}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 hover:border-zinc-400 transition-all active:scale-95 flex items-center gap-2"
              title="Copy CSV to clipboard"
            >
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copySuccess ? 'Copied!' : 'Copy CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Invoice-level warnings */}
      <InvoiceWarnings invoice={invoice} />

      {/* Side-by-Side Workspace */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Panel: Invoice Image Viewer (Sticky on Desktop) */}
        {showImageSidebar && (
          <div className="w-full lg:w-[40%] xl:w-[35%] lg:sticky lg:top-20 z-10 transition-all duration-300">
            <InvoiceImageViewer invoice={invoice} />
          </div>
        )}

        {/* Right Panel: Editable Data */}
        <div className={`w-full ${showImageSidebar ? 'lg:w-[60%] xl:w-[65%]' : 'lg:w-full'} flex flex-col gap-4 transition-all duration-300`}>
          
          {/* Summary Tabs */}
          <div className="flex overflow-x-auto rounded-xl bg-zinc-100/80 p-1.5 shadow-sm border border-zinc-200">
            <button
              onClick={() => setActiveTab('high')}
              className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-all ${
                activeTab === 'high' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              High ({stats.high})
            </button>
            <button
              onClick={() => setActiveTab('medium')}
              className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-all ${
                activeTab === 'medium' ? 'bg-white text-amber-700 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              Suggested ({stats.medium})
            </button>
            <button
              onClick={() => setActiveTab('low')}
              className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-all ${
                activeTab === 'low' ? 'bg-white text-red-700 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              Review ({stats.low})
            </button>
          </div>

          {/* Line Items Cards */}
          <div className="space-y-4">
            {editedLineItems.filter(item => {
              if (activeTab === 'high') return item.confidenceScore >= 90;
              if (activeTab === 'medium') return item.confidenceScore >= 70 && item.confidenceScore < 90;
              if (activeTab === 'low') return item.confidenceScore < 70;
              return true;
            }).map((item) => {
              const idx = editedLineItems.findIndex(i => i.id === item.id);
              return (
                <CompactLineItemCard
                  key={item.id}
                  item={item as LineItem}
                  index={idx}
                  edits={edits}
                  onFieldChange={handleFieldChange}
                />
              );
            })}
            
            {editedLineItems.length > 0 && editedLineItems.filter(item => {
              if (activeTab === 'high') return item.confidenceScore >= 90;
              if (activeTab === 'medium') return item.confidenceScore >= 70 && item.confidenceScore < 90;
              if (activeTab === 'low') return item.confidenceScore < 70;
              return false;
            }).length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
                <p className="text-sm font-medium text-zinc-500">No items in this category.</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {editedLineItems.length > 0 && (
            <div className="sticky bottom-16 lg:bottom-4 mt-4 space-y-3 rounded-2xl bg-white/95 backdrop-blur-sm p-5 shadow-xl border border-zinc-200">
              <div className="flex gap-3">
                <button
                  onClick={handleAcceptAllGreen}
                  className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-95 shadow-sm"
                >
                  Accept All Green
                </button>
                <button
                  onClick={handleSaveEdits}
                  disabled={saving || (!hasEdits && !saveSuccess)}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                  {saveSuccess ? (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Saved!
                    </>
                  ) : saving ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Edits'
                  )}
                </button>
              </div>
              <button
                onClick={handleConfirmExport}
                disabled={saving}
                className="w-full rounded-xl bg-zinc-900 px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Exporting...' : 'Confirm & Export CSV'}
              </button>
            </div>
          )}

          {editedLineItems.length === 0 && (
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm border border-zinc-200">
              <p className="text-lg font-semibold text-zinc-700">No line items extracted</p>
              <p className="mt-2 text-sm text-zinc-500">
                The OCR engine could not detect a table in this invoice.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
