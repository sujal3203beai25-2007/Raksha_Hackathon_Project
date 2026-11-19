import { FileText, ShieldCheck } from 'lucide-react';
import React from 'react';
import { SurfaceCard } from './ui/Primitives.tsx';

export const ComplianceView: React.FC = () => (
  <div className="max-w-4xl mx-auto space-y-6 pb-8">
    <div>
      <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
        Draft Template — Requires Counsel Legal Review Before Public Deployment
      </div>
      <h1 className="mt-1.5 text-2xl font-bold text-[#10243A] dark:text-white tracking-tight">
        DPDP Privacy Notice, Terms of Coordination &amp; Interoperability Status
      </h1>
    </div>

    <SurfaceCard className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      <div className="flex items-start sm:items-center gap-2 text-[#10243A] dark:text-white font-bold text-base">
        <ShieldCheck className="h-5 w-5 text-[#087F8C] shrink-0 mt-0.5 sm:mt-0" />
        <h2>Digital Personal Data Protection (DPDP) Notice Template</h2>
      </div>
      <p>
        <strong>Data Fiduciary Scope:</strong> RAKSHA collects only the minimum personal information necessary to coordinate public healthcare facility discovery, patient-consented referrals, and authorized emergency coordination across Maharashtra.
      </p>
      <p>
        <strong>Granular Consent &amp; Revocation:</strong> Citizens may separately grant or revoke consent for triage sharing, referral handover sharing, live emergency GPS coordinates, AI summarization, and dependent caregiver access at any time from the Health Records portal.
      </p>
      <p>
        <strong>Data Principal Rights:</strong> Signed-in users can download a portable JSON copy of their personal profile, consents, and records, or submit an erasure request (subject to statutory medical/audit retention obligations).
      </p>
    </SurfaceCard>

    <SurfaceCard className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      <div className="flex items-start sm:items-center gap-2 text-[#10243A] dark:text-white font-bold text-base">
        <FileText className="h-5 w-5 text-[#087F8C] shrink-0 mt-0.5 sm:mt-0" />
        <h2>Medical Safety, Dispatch &amp; ABDM Certification Disclaimer</h2>
      </div>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong>Non-Diagnostic Platform:</strong> Automated symptom triage rules (<code>triage-v2.1-mh</code>) and multilingual FAQ responses provide navigation guidance only and are not a substitute for qualified physicians.
        </li>
        <li>
          <strong>Emergency Dispatch Boundary:</strong> RAKSHA does not replace public emergency numbers <strong>108</strong> or <strong>112</strong>. In the live pilot tenant (<code>mh-live</code>), automated vehicle dispatch remains disabled until verified EMS integration is onboarded.
        </li>
        <li>
          <strong>FHIR / ABDM Interoperability Status:</strong> The <code>/api/fhir/ServiceRequest/convert</code> endpoint provides a structural FHIR R4 preview adapter only and is explicitly <strong>not ABDM or NHCX certified</strong>.
        </li>
      </ul>
      <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
        <a
          href="/api/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-[44px] text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline"
        >
          View OpenAPI 3.1 API Specification (/api/openapi.json) →
        </a>
      </div>
    </SurfaceCard>
  </div>
);
