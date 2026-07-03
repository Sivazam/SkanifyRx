/**
 * API URL helper for Cloud Functions (Gen 2).
 *
 * Gen 2 functions deployed to Cloud Run get individual URLs like:
 *   https://processinvoice-todog7uc5q-em.a.run.app
 *
 * In dev (emulator), all functions share a single base:
 *   http://localhost:5001/skanifyrx/asia-south2/<functionName>
 *
 * This module provides a single `getApiUrl(functionName)` that works in both.
 */

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL || '';
const CLOUD_RUN_BASE = import.meta.env.VITE_CLOUD_RUN_BASE || '';

/**
 * Get the full URL for a Cloud Function by name.
 *
 * In emulator mode: http://localhost:5001/skanifyrx/asia-south2/processInvoice
 * In production:    https://processinvoice-<hash>-<region>.a.run.app
 */
export function getApiUrl(functionName: string): string {
  // If a full base URL is set (emulator or custom), append function name as path
  if (FUNCTIONS_URL) {
    return `${FUNCTIONS_URL}/${functionName}`;
  }

  // Production: use Cloud Run base pattern
  // Cloud Run URLs are: https://<lowercase-function-name>-<hash>.a.run.app
  if (CLOUD_RUN_BASE) {
    const lowerName = functionName.toLowerCase();
    return CLOUD_RUN_BASE.replace('FUNCTION_NAME', lowerName);
  }

  // Fallback: use hardcoded Cloud Run URLs for this project
  const FUNCTION_URLS: Record<string, string> = {
    processInvoice: 'https://processinvoice-todog7uc5q-em.a.run.app',
    onboardPharmacy: 'https://onboardpharmacy-todog7uc5q-em.a.run.app',
    inviteTeamMember: 'https://inviteteammember-todog7uc5q-em.a.run.app',
    updatePharmacySettings: 'https://updatepharmacysettings-todog7uc5q-em.a.run.app',
    getSignedImageUrl: 'https://getsignedimageurl-todog7uc5q-em.a.run.app',
    importDrugs: 'https://importdrugs-todog7uc5q-em.a.run.app',
    learnDrugEdits: 'https://learndrugedits-todog7uc5q-em.a.run.app',
  };

  const url = FUNCTION_URLS[functionName];
  if (!url) {
    console.error(`Unknown function: ${functionName}`);
    return `https://${functionName.toLowerCase()}-todog7uc5q-em.a.run.app`;
  }
  return url;
}
