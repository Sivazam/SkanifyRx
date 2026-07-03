// ── Shared Types ──────────────────────────────────────────

export type InvoiceStatus =
  | 'uploading'
  | 'preprocessing'
  | 'ocr_running'
  | 'validating'
  | 'review'
  | 'confirmed'
  | 'exported'
  | 'error';

export type OCREngine = 'tesseract' | 'vision' | 'both';

export type VisionApiMode = 'off' | 'compare' | 'vision_primary' | 'gemini' | 'gemini_vision' | 'deepseek' | 'z_ai';

export type OcrProvider = 'tesseract' | 'vision' | 'z_ai';
export type IntelligenceProvider = 'rule_based' | 'gemini' | 'deepseek' | 'z_ai';

export type GeminiModel = 'flash' | 'flash-nothink' | 'flash-lite';
export type ZaiModel = 'glm-5.1';

export type UserFeedback = 'good' | 'poor' | null;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  llmCost: number;
  visionCost: number;
  storageCost: number;
  totalCost: number;
}

// ── Invoice ──────────────────────────────────────────────

export interface Invoice {
  id: string;
  pharmacyId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  imageUrls: string[];
  status: InvoiceStatus;
  uploadedBy?: string;
  uploadedByName?: string;
  visionApiMode: VisionApiMode; // legacy
  ocrProvider?: OcrProvider;
  intelligenceProvider?: IntelligenceProvider;
  processingError: string | null;
  totalAmount: number | null;
  totalItems: number | null;
  userFeedback: UserFeedback;
  correctionRate: number | null;
  lineItemCount?: number;
  highConfidenceCount?: number;
  reviewNeededCount?: number;
  totalCorrections?: number;
  totalWarnings?: number;
  totalErrors?: number;
  invoiceWarnings?: Array<{ field: string; message: string; severity: string }>;
  viewed?: boolean;
  usageMetrics?: TokenUsage;
  createdAt: Date;
  updatedAt: Date;
}

// ── Line Item ────────────────────────────────────────────

export interface FieldConfidence {
  drugName: number;
  batchNo: number;
  expiryDate: number;
  mrp: number;
  qty: number;
  freeQty: number;
  rate: number;
  ptrPts: number;
  discountPct: number;
  gstPct: number;
  netAmount: number;
  totalAmount: number;
  hsnCode: number;
}

export interface OCRFieldResult {
  text: string;
  confidence: number;
}

export interface OCRComparisonField {
  [fieldName: string]: OCRFieldResult;
}

export interface OCRComparison {
  tesseract: OCRComparisonField;
  vision: OCRComparisonField;
  chosenEngine: Record<string, 'tesseract' | 'vision' | 'manual'>;
}

export interface LineItem {
  id: string;
  srNo: number;
  productCode: string;
  drugName: string;
  packing: string;
  matchedDrugId: string | null;
  batchNo: string;
  expiryDate: string; // MM/YYYY
  mrp: number;
  qty: number;
  freeQty: number;
  rate: number;
  ptrPts: number;
  discountPct: number;
  gstPct: number;
  cgst: number;
  sgst: number;
  netAmount: number;
  totalAmount: number;
  hsnCode: string;
  confidenceScore: number;
  fieldConfidences: Partial<FieldConfidence>;
  needsReview: boolean;
  ocrComparison: OCRComparison | null;
  wasEdited: boolean;
}

// ── Pharmacy ─────────────────────────────────────────────

export type DeepSeekModel = 'deepseek-v4-pro' | 'deepseek-chat' | 'deepseek-reasoner';

export interface PharmacySettings {
  visionApiMode: VisionApiMode; // Legacy field for backwards compatibility
  ocrProvider?: OcrProvider;
  intelligenceProvider?: IntelligenceProvider;
  geminiModel?: GeminiModel;
  deepseekModel?: DeepSeekModel;
  zaiModel?: ZaiModel;
}

export interface Pharmacy {
  id: string;
  name: string;
  drugLicenseNo: string;
  gstin: string;
  ownerUid: string;
  settings: PharmacySettings;
  createdAt: Date;
}

// ── Drug Master ──────────────────────────────────────────

export interface Drug {
  id: string;
  drugName: string;
  aliases: string[];
  hsnCode: string;
  defaultGstPct: number;
  lastKnownMrp: number;
  manufacturer: string;
  lastSeenAt: Date;
}

// ── Supplier ─────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  gstin: string;
  drugLicenseNo: string;
  columnConfig: Record<string, string>;
}

// ── Auth ─────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  phoneNumber: string | null;
  email: string | null;
  displayName: string | null;
  pharmacyId: string | null;
  role: 'admin' | 'staff';
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  pharmacyId: string | null;
  role: 'super_admin' | 'admin' | 'user';
  active: boolean;
  totalScans: number;
  credits: number;
  monthlyLimit: number | null;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface UsageLog {
  id: string;
  date: string;
  invoiceId?: string;
  pharmacyId?: string;
  pagesScanned?: number;
  creditsDeducted?: number;
  type: 'scan' | 'topup';
  creditsAdded?: number;
  addedBy?: string;
  note?: string;
  timestamp: Date;
}
