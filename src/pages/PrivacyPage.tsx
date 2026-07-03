export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="mb-2 text-xs text-gray-400">Last updated: {new Date().toLocaleDateString('en-IN')}</p>

        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">1. Data Collection</h2>
            <p>We collect the following data when you use AccuBolt:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong>Phone number</strong> — used for OTP-based authentication.</li>
              <li><strong>Pharmacy details</strong> — name, drug license number, and GSTIN provided during onboarding.</li>
              <li><strong>Invoice images</strong> — uploaded for OCR processing.</li>
              <li><strong>Extracted invoice data</strong> — drug names, quantities, prices, batch numbers, and other invoice fields.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">2. Data Usage</h2>
            <p>Your data is used exclusively to:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Authenticate your identity and manage your account.</li>
              <li>Process invoice images through our OCR pipeline.</li>
              <li>Improve OCR accuracy through anonymized aggregate metrics.</li>
              <li>Provide customer support when requested.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">3. Data Storage & Security</h2>
            <ul className="ml-4 list-disc space-y-1">
              <li>All data is stored on Google Cloud / Firebase infrastructure with encryption at rest and in transit.</li>
              <li>Invoice images are stored in Firebase Cloud Storage with access restricted to your pharmacy team.</li>
              <li>API calls are authenticated using Firebase Auth ID tokens.</li>
              <li>We do not sell, share, or disclose your data to third parties except as required by Indian law.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">4. DPDPA Compliance</h2>
            <p>
              In compliance with the Digital Personal Data Protection Act, 2023 (DPDPA):
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong>Consent:</strong> By using AccuBolt, you consent to the processing of your personal data as described in this policy.</li>
              <li><strong>Purpose limitation:</strong> Your data is used only for the purposes stated above.</li>
              <li><strong>Right to erasure:</strong> You may request deletion of your account and all associated data by contacting support.</li>
              <li><strong>Data principal rights:</strong> You have the right to access, correct, and port your data.</li>
              <li><strong>Grievance redressal:</strong> Contact us for any concerns about data handling.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">5. Data Retention</h2>
            <ul className="ml-4 list-disc space-y-1">
              <li>Invoice images are retained for 90 days after processing, then automatically deleted.</li>
              <li>Extracted invoice data (line items, CSV exports) is retained as long as your account is active.</li>
              <li>Account data is deleted within 30 days of account deletion request.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">6. Third-Party Services</h2>
            <p>AccuBolt uses the following third-party services:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong>Google Cloud Vision API</strong> (optional) — for enhanced OCR accuracy. Invoice images may be sent to Google Cloud for processing.</li>
              <li><strong>Firebase</strong> — for authentication, database, and file storage.</li>
              <li><strong>Sentry</strong> — for error monitoring (no personal data is sent).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">7. Contact</h2>
            <p>
              For privacy-related inquiries, data access requests, or to exercise your DPDPA rights, contact
              us at <span className="font-medium text-[var(--color-primary)]">privacy@AccuBolt.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
