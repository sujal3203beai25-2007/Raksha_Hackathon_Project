# RAKSHA Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **No Self-Assigned Privileged Roles**: On `/users/{uid}` create, `role` MUST equal `'patient'`. Users cannot escalate their own role or write to `/admins/{uid}` or `/role_grants/{uid}`.
2. **PII Isolation**: Email, phone, village address, allergies, and emergency contacts reside strictly in `/users/{uid}/private/info` and are readable/writable ONLY by `request.auth.uid == uid` or verified platform admins.
3. **Tenant Isolation (Live vs Demo)**: Live tenant (`mh-live`) records require strict ownership or verified `role_grants` staff privileges. Demo tenant (`demo-maharashtra`) records are strictly isolated by `tenantId == 'demo-maharashtra'` and never mix with `mh-live`.
4. **Immutable Audit & Event Trails**: `/referrals/{id}/events/{eventId}`, `/emergencies/{id}/events/{eventId}`, and `/audit_logs/{auditId}` allow `create` only with server timestamp (`request.time`) and forbid `update` and `delete`.
5. **Terminal State Locking**: Referrals in `completed`, `cancelled`, `rejected`, or `expired` status, and Emergencies in `closed` or `cancelled` status cannot be updated by non-admins.
6. **Temporal Integrity**: All `createdAt` / `updatedAt` timestamps on write MUST equal `request.time`.
7. **ID & Size Hardening**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and every string field enforces explicit `.size()` upper bounds.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Yield PERMISSION_DENIED)
1. **Privilege Escalation on Signup**: `POST /users/attacker` with `{ role: 'platform_admin' }` -> DENIED.
2. **Shadow Field Injection on User**: `PATCH /users/patient1` adding `{ isVerifiedStaff: true }` -> DENIED (`affectedKeys().hasOnly(...)`).
3. **Cross-User PII Read**: `GET /users/victim/private/info` by `attacker` -> DENIED.
4. **Unverified Email Spoof**: Request with `email == 'ansh32ika94@gmail.com'` and `email_verified == false` -> DENIED.
5. **Live Dispatch Tampering by Patient**: `PATCH /emergencies/live-1` by patient setting `status: 'driver_accepted'` -> DENIED.
6. **Terminal Referral Re-Opening**: `PATCH /referrals/ref-1` changing `status` from `'completed'` to `'accepted'` -> DENIED.
7. **Orphaned Referral Event**: `POST /referrals/nonexistent/events/ev-1` -> DENIED (`exists()` parent gate fails).
8. **Audit Log Tampering**: `DELETE /audit_logs/log-1` or `UPDATE /audit_logs/log-1` -> DENIED.
9. **ID Poisoning**: `POST /referrals/` + 500-char ID -> DENIED (`isValidId()` fails).
10. **Client-Forged Timestamp**: `POST /triage_logs/t-1` with backdated `createdAt` (`!= request.time`) -> DENIED.
11. **Live Facility Capacity Fabrication**: Unauthenticated or patient `PATCH /facilities/mh-live-phc1` changing `icuBedsAvailable` -> DENIED.
12. **Blanket List Query Scraping**: `LIST /referrals` without owner/tenant constraint -> DENIED.
