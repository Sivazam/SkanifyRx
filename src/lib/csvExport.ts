/**
 * CSV Export Utility
 *
 * Client-side CSV generation from confirmed line items.
 * Uses papaparse for robust CSV encoding with UTF-8 BOM for Excel.
 */
import Papa from 'papaparse';
import type { LineItem } from '../types';

/** Standard CSV column definitions for Indian pharmacy invoices */
export interface CSVColumn {
  key: keyof LineItem | string;
  label: string;
  enabled: boolean;
}

export const DEFAULT_COLUMNS: CSVColumn[] = [
  { key: 'srNo', label: 'Sr.No', enabled: true },
  { key: 'invoiceNumber', label: 'Invoice No', enabled: true },
  { key: 'invoiceDate', label: 'Invoice Date', enabled: true },
  { key: 'productCode', label: 'Product Code', enabled: true },
  { key: 'drugName', label: 'Drug Name', enabled: true },
  { key: 'packing', label: 'Packing', enabled: true },
  { key: 'hsnCode', label: 'HSN Code', enabled: true },
  { key: 'batchNo', label: 'Batch No', enabled: true },
  { key: 'expiryDate', label: 'Expiry (MM/YYYY)', enabled: true },
  { key: 'mrp', label: 'MRP', enabled: true },
  { key: 'qty', label: 'Qty', enabled: true },
  { key: 'freeQty', label: 'Free Qty', enabled: true },
  { key: 'rate', label: 'PTS', enabled: true },
  { key: 'ptrPts', label: 'PTR', enabled: true },
  { key: 'discountPct', label: 'Discount%', enabled: true },
  { key: 'gstPct', label: 'GST%', enabled: true },
  { key: 'cgst', label: 'CGST', enabled: true },
  { key: 'sgst', label: 'SGST', enabled: true },
  { key: 'netAmount', label: 'Taxable Amount', enabled: true },
  { key: 'totalAmount', label: 'Total', enabled: true },
];

/**
 * Neutralize CSV formula injection: a string cell beginning with = + - @ (or tab/CR)
 * is treated as a formula by Excel/Sheets. A crafted drug name like `=HYPERLINK(...)`
 * (from OCR or a manual edit) would then execute on open. Prefixing an apostrophe forces
 * the cell to be interpreted as text. Numbers are left untouched so they stay numeric.
 */
function sanitizeCell(value: unknown): unknown {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Generate CSV string from line items.
 * Includes UTF-8 BOM for correct Excel display.
 * @param invoiceMeta - Invoice-level metadata to inject into every row (e.g. invoiceDate)
 */
export function generateCSV(
  lineItems: LineItem[],
  columns: CSVColumn[] = DEFAULT_COLUMNS,
  invoiceMeta?: { invoiceDate?: string; invoiceNumber?: string },
): string {
  const enabledColumns = columns.filter((col) => col.enabled);

  // Build header row
  const headers = enabledColumns.map((col) => col.label);

  // Build data rows
  const rows = lineItems.map((item, index) =>
    enabledColumns.map((col) => {
      let value: unknown;
      if (col.key === 'srNo') value = index + 1;
      else if (col.key === 'invoiceNumber') value = invoiceMeta?.invoiceNumber ?? '';
      else if (col.key === 'invoiceDate') value = invoiceMeta?.invoiceDate ?? '';
      else {
        const raw = item[col.key as keyof LineItem];
        value = raw === null || raw === undefined ? '' : raw;
      }
      return sanitizeCell(value);
    })
  );

  // Use papaparse to generate CSV
  const csv = Papa.unparse({
    fields: headers,
    data: rows,
  });

  // Add UTF-8 BOM for Excel compatibility
  return '\uFEFF' + csv;
}

/**
 * Download CSV as a file.
 */
export function downloadCSV(
  lineItems: LineItem[],
  filename: string,
  columns?: CSVColumn[],
  invoiceMeta?: { invoiceDate?: string; invoiceNumber?: string },
): void {
  const csv = generateCSV(lineItems, columns, invoiceMeta);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Copy CSV to clipboard.
 */
export async function copyCSVToClipboard(
  lineItems: LineItem[],
  columns?: CSVColumn[],
): Promise<boolean> {
  try {
    const csv = generateCSV(lineItems, columns);
    await navigator.clipboard.writeText(csv);
    return true;
  } catch {
    return false;
  }
}
