# RAKSHA — The Right Care. The Right Facility. At the Right Time.

**RAKSHA** is a mobile-first, installable Progressive Web App (PWA) and multi-role web coordination platform for rural and underserved public healthcare across **Maharashtra**, spanning four core pillars:

1. **Access** — Public facility discovery (PHC, RH, SDH, DH, Medical College, Trust) with explainable ranking, explicit data provenance, Google Maps + accessible text views, and strict `Unknown` capacity reporting when live data is unavailable or expired.
2. **Referral** — Deterministic rules-based non-diagnostic symptom screening (`triage-v2.1-mh`), finite-state-machine enforced referrals (`draft -> submitted -> under_review -> accepted -> transfer_arranged -> in_transit -> arrived -> handed_over -> completed`), short-lived QR retrieval passes, immutable transition audit trails, and a structural FHIR R4 `ServiceRequest` adapter.
3. **Emergency Response** — Direct **108 / 112** fallback at every step, anti-accidental emergency confirmation, live dispatch disabled safely in `mh-live` until verified EMS integration, and a full end-to-end **Demo Sandbox (`demo-maharashtra`)** with ambulance candidate scoring, driver acceptance, GPS consent, and hospital readiness handover.
4. **Continuity** — Owner-isolated private health profiles, granular revocable DPDP consents, guardian-confirmed family care, post-discharge follow-ups, IndexedDB offline ASHA draft queueing, and English / हिन्दी / मराठी localization with Web Speech API voice input/output.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query, `@vis.gl/react-google-maps`, `qrcode.react`, `idb`, `vite-plugin-pwa`.
- **Backend**: Node.js + Express + `ws` WebSockets + `@google/genai` (`gemini-4-hydrogen` server-side AI gateway with PII redaction) + Firebase Admin token verification.
- **Database & Rules**: Cloud Firestore with hardened RBAC, schema validation, optimistic versioning, and immutable audit trails (`firestore.rules`).

## Local Verification & Scripts
- `npm run dev` — Start full-stack Express + Vite + WebSocket server on port 3000.
- `npm run lint` — TypeScript typecheck (`tsc --noEmit`).
- `npm run lint:rules` — ESLint Firebase security rules audit (`eslint firestore.rules`).
- `npm test` — Run automated Vitest suites (`tests/core.test.ts` and `firestore.rules.test.ts`).
- `npm run build` — Build production client + PWA service worker bundle into `dist/`.

## Important Pilot Disclaimers
- RAKSHA is coordination pilot software and **does not replace doctors, hospitals, or 108 / 112 emergency services**.
- The FHIR R4 adapter (`/api/fhir/ServiceRequest/convert`) is a structural preview only and is **not ABDM / NHCX certified**.
- Privacy & Terms content inside the app is a draft template pending counsel legal review.
