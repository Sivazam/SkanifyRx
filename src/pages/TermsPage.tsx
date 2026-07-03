export function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Terms of Service</h1>
        <p className="mb-2 text-xs text-gray-400">Last updated: {new Date().toLocaleDateString('en-IN')}</p>

        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">1. Acceptance of Terms</h2>
            <p>
              By accessing or using AccuBolt ("the Service"), you agree to be bound by these Terms of Service.
              The Service is intended for licensed pharmacies operating in India.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">2. Description of Service</h2>
            <p>
              AccuBolt provides OCR-based scanning of pharmaceutical purchase invoices and converts them into
              structured CSV data. The Service is a productivity tool and does not replace professional verification
              of purchase records.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">3. User Responsibilities</h2>
            <ul className="ml-4 list-disc space-y-1">
              <li>You must be a licensed pharmacist or authorized representative of a registered pharmacy.</li>
              <li>You are responsible for verifying all OCR-extracted data before use.</li>
              <li>You must not upload invoices belonging to other pharmacies without authorization.</li>
              <li>You must maintain the confidentiality of your account credentials.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">4. Data Accuracy Disclaimer</h2>
            <p>
              OCR technology is not 100% accurate. AccuBolt provides confidence scores to help you identify
              areas that need manual verification. You acknowledge that the Service may produce errors and you
              bear responsibility for reviewing and correcting extracted data.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">5. Limitation of Liability</h2>
            <p>
              AccuBolt shall not be liable for any direct, indirect, incidental, or consequential damages
              arising from the use of the Service, including errors in OCR-extracted data that may affect
              purchase records or inventory management.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-800">6. Modifications</h2>
            <p>
              We reserve the right to modify these terms at any time. Continued use of the Service after
              changes constitutes acceptance of the modified terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
