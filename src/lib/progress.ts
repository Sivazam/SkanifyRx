import type { InvoiceStatus } from '../types';

export function getStatusProgress(status: InvoiceStatus): number {
  switch (status) {
    case 'uploading': return 15;
    case 'preprocessing': return 40;
    case 'ocr_running': return 70;
    case 'validating': return 90;
    case 'review':
    case 'confirmed':
    case 'exported': return 100;
    case 'error': return 0;
    default: return 0;
  }
}
