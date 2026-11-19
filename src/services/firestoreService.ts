import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { canTransitionEmergency, canTransitionReferral } from '../shared/referralFsm.ts';
import { buildDemoAmbulances, buildDemoFacilities } from '../shared/seedData.ts';
import {
  AiCitation,
  AiGroundingMode,
  AiMessageRecord,
  AiModelMode,
  AiPersona,
  AiSessionRecord,
  AmbulanceUnit,
  AuditLogItem,
  ConsentPurpose,
  ConsentRecord,
  DependentRecord,
  EmergencyRecord,
  EmergencyStatus,
  FacilityRecord,
  FollowUpItem,
  HealthRecordItem,
  OxygenStatus,
  ReferralEventRecord,
  ReferralRecord,
  ReferralStatus,
  ReferralUrgency,
  TenantId,
  TriageResult,
} from '../shared/types.ts';

function newId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}-${rand}`;
}

export async function seedDemoTenantIfNeeded(actorUid: string): Promise<void> {
  const demoFacilities = buildDemoFacilities();
  const demoAmbulances = buildDemoAmbulances();
  const batch = writeBatch(db);
  let writes = 0;

  try {
    for (const fac of demoFacilities) {
      const ref = doc(db, 'facilities', fac.facilityId);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        batch.set(ref, {
          ...fac,
          last_updated_by: actorUid,
          updatedAt: serverTimestamp(),
        });
        writes += 1;
      }
    }

    for (const amb of demoAmbulances) {
      const ref = doc(db, 'ambulances', amb.ambulanceId);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        batch.set(ref, {
          ...amb,
          updatedAt: serverTimestamp(),
        });
        writes += 1;
      }
    }

    if (writes > 0) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'demo-maharashtra/seed');
  }
}

export function subscribeFacilities(
  tenantId: TenantId,
  onData: (items: FacilityRecord[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'facilities'), where('tenantId', '==', tenantId), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as FacilityRecord));
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'facilities');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function updateFacilityCapacity(
  facilityId: string,
  icuBedsAvailable: number,
  generalBedsAvailable: number,
  oxygenAvailable: OxygenStatus,
  actorUid: string,
  tenantId: TenantId
): Promise<void> {
  const facRef = doc(db, 'facilities', facilityId);
  const auditId = newId('aud');
  const batch = writeBatch(db);
  batch.update(facRef, {
    icuBedsAvailable,
    generalBedsAvailable,
    oxygenAvailable,
    source_timestamp: new Date().toISOString(),
    verification_status: tenantId === 'demo-maharashtra' ? 'demo_fixture' : 'verified_live',
    last_updated_by: actorUid,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId,
    actorUid,
    actorRole: 'hospital_coordinator',
    action: 'FACILITY_CAPACITY_UPDATED',
    resourceType: 'facility',
    resourceId: facilityId,
    reason: `ICU=${icuBedsAvailable}, General=${generalBedsAvailable}, O2=${oxygenAvailable}`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `facilities/${facilityId}`);
  }
}

export async function saveTriageLog(uid: string, tenantId: TenantId, result: TriageResult): Promise<string> {
  const triageId = newId('trg');
  try {
    await setDoc(doc(db, 'triage_logs', triageId), {
      triageId,
      uid,
      tenantId,
      ruleVersion: result.ruleVersion,
      urgency: result.urgency,
      redFlags: result.redFlags,
      symptoms: result.symptoms,
      rationale: result.rationale,
      humanReviewRequired: result.humanReviewRequired,
      createdAt: serverTimestamp(),
    });
    return triageId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `triage_logs/${triageId}`);
  }
}

export async function createReferralRecord(params: {
  tenantId: TenantId;
  patientUid: string;
  patientDisplayName: string;
  createdByUid: string;
  actorRole: string;
  originFacilityId: string;
  originFacilityName: string;
  destinationFacilityId: string;
  destinationFacilityName: string;
  urgency: ReferralUrgency;
  reason: string;
  clinicalSummary: string;
  initialStatus?: 'draft' | 'submitted';
  consentId?: string;
}): Promise<string> {
  const referralId = newId('ref');
  const eventId = newId('rev');
  const auditId = newId('aud');
  const status = params.initialStatus ?? 'submitted';
  const qrToken = `RK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const qrExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const escalationDeadline = new Date(
    Date.now() + (params.urgency === 'emergency' ? 15 : params.urgency === 'urgent' ? 60 : 240) * 60 * 1000
  ).toISOString();

  const batch = writeBatch(db);
  batch.set(doc(db, 'referrals', referralId), {
    referralId,
    tenantId: params.tenantId,
    patientUid: params.patientUid,
    patientDisplayName: params.patientDisplayName.slice(0, 120),
    createdByUid: params.createdByUid,
    originFacilityId: params.originFacilityId,
    originFacilityName: params.originFacilityName.slice(0, 200),
    destinationFacilityId: params.destinationFacilityId,
    destinationFacilityName: params.destinationFacilityName.slice(0, 200),
    urgency: params.urgency,
    status,
    version: 1,
    idempotencyKey: newId('idem'),
    ...(params.consentId ? { consentId: params.consentId } : {}),
    reason: params.reason.slice(0, 500),
    clinicalSummary: params.clinicalSummary.slice(0, 2000),
    qrToken,
    qrExpiresAt,
    escalationDeadline,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'referrals', referralId, 'events', eventId), {
    eventId,
    referralId,
    fromStatus: 'none',
    toStatus: status,
    actorUid: params.createdByUid,
    actorRole: params.actorRole,
    note: 'Referral initialized',
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId: params.tenantId,
    actorUid: params.createdByUid,
    actorRole: params.actorRole,
    action: 'REFERRAL_CREATED',
    resourceType: 'referral',
    resourceId: referralId,
    reason: `Urgency=${params.urgency}, Destination=${params.destinationFacilityName}`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return referralId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `referrals/${referralId}`);
  }
}

export async function transitionReferralStatus(params: {
  referral: ReferralRecord;
  toStatus: ReferralStatus;
  actorUid: string;
  actorRole: string;
  note?: string;
  assignedClinicianUid?: string;
  rejectionOrCancelReason?: string;
}): Promise<void> {
  if (!canTransitionReferral(params.referral.status, params.toStatus)) {
    throw new Error(`Invalid referral FSM transition: ${params.referral.status} -> ${params.toStatus}`);
  }

  const refDoc = doc(db, 'referrals', params.referral.referralId);
  const eventId = newId('rev');
  const auditId = newId('aud');
  const batch = writeBatch(db);

  const updates: Record<string, unknown> = {
    status: params.toStatus,
    version: increment(1),
    updatedAt: serverTimestamp(),
  };
  if (params.assignedClinicianUid) updates.assignedClinicianUid = params.assignedClinicianUid;
  if (params.rejectionOrCancelReason) updates.rejectionOrCancelReason = params.rejectionOrCancelReason.slice(0, 500);

  batch.update(refDoc, updates);
  batch.set(doc(db, 'referrals', params.referral.referralId, 'events', eventId), {
    eventId,
    referralId: params.referral.referralId,
    fromStatus: params.referral.status,
    toStatus: params.toStatus,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    note: (params.note || params.rejectionOrCancelReason || `Transitioned to ${params.toStatus}`).slice(0, 500),
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId: params.referral.tenantId,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    action: `REFERRAL_${params.toStatus.toUpperCase()}`,
    resourceType: 'referral',
    resourceId: params.referral.referralId,
    reason: (params.note || params.rejectionOrCancelReason || 'Workflow step').slice(0, 500),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `referrals/${params.referral.referralId}`);
  }
}

export async function attachReferralAiSummary(
  referralId: string,
  aiSummaryText: string,
  actorUid: string,
  tenantId: TenantId
): Promise<void> {
  const refDoc = doc(db, 'referrals', referralId);
  const auditId = newId('aud');
  const batch = writeBatch(db);
  batch.update(refDoc, {
    aiSummaryText: aiSummaryText.slice(0, 2000),
    aiSummaryPendingReview: true,
    version: increment(1),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId,
    actorUid,
    actorRole: 'clinician',
    action: 'REFERRAL_AI_SUMMARY_DRAFTED',
    resourceType: 'referral',
    resourceId: referralId,
    reason: 'AI summary generated with consent; flagged pending clinician review',
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `referrals/${referralId}`);
  }
}

export function subscribeReferrals(
  tenantId: TenantId,
  uid: string | null,
  canViewAllInTenant: boolean,
  onData: (items: ReferralRecord[]) => void,
  onError: (err: Error) => void
) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  const q = canViewAllInTenant
    ? query(collection(db, 'referrals'), where('tenantId', '==', tenantId), limit(50))
    : query(collection(db, 'referrals'), where('patientUid', '==', uid), limit(50));

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => d.data() as ReferralRecord)
        .filter((r) => r.tenantId === tenantId)
        .sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt));
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'referrals');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

function toEpochMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'string') {
    const t = Date.parse(val);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

export async function fetchReferralEvents(referralId: string): Promise<ReferralEventRecord[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'referrals', referralId, 'events'), orderBy('createdAt', 'asc'), limit(40))
    );
    return snap.docs.map((d) => d.data() as ReferralEventRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `referrals/${referralId}/events`);
  }
}

export async function createEmergencyRequest(params: {
  tenantId: TenantId;
  patientUid: string;
  patientDisplayName: string;
  callbackNumber: string;
  locationMode: 'gps' | 'manual';
  villageOrLandmark: string;
  lat?: number;
  lng?: number;
  symptoms?: string;
}): Promise<string> {
  const emergencyId = newId('emg');
  const eventId = newId('eev');
  const auditId = newId('aud');
  const batch = writeBatch(db);

  batch.set(doc(db, 'emergencies', emergencyId), {
    emergencyId,
    tenantId: params.tenantId,
    patientUid: params.patientUid,
    patientDisplayName: params.patientDisplayName.slice(0, 120),
    callbackNumber: params.callbackNumber.slice(0, 30),
    locationMode: params.locationMode,
    villageOrLandmark: params.villageOrLandmark.slice(0, 200),
    ...(typeof params.lat === 'number' ? { lat: params.lat } : {}),
    ...(typeof params.lng === 'number' ? { lng: params.lng } : {}),
    ...(params.symptoms ? { symptoms: params.symptoms.slice(0, 600) } : {}),
    status: 'pending_validation',
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'emergencies', emergencyId, 'events', eventId), {
    eventId,
    emergencyId,
    fromStatus: 'none',
    toStatus: 'pending_validation',
    actorUid: params.patientUid,
    actorRole: 'patient',
    note: `Emergency assistance requested (${params.locationMode})`,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId: params.tenantId,
    actorUid: params.patientUid,
    actorRole: 'patient',
    action: 'EMERGENCY_REQUESTED',
    resourceType: 'emergency',
    resourceId: emergencyId,
    reason: params.villageOrLandmark.slice(0, 200),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return emergencyId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `emergencies/${emergencyId}`);
  }
}

export async function transitionEmergencyStatus(params: {
  emergency: EmergencyRecord;
  toStatus: EmergencyStatus;
  actorUid: string;
  actorRole: string;
  note?: string;
  assignedAmbulanceId?: string;
  assignedDriverUid?: string;
  destinationFacilityId?: string;
  destinationFacilityName?: string;
  etaMinutes?: number;
  gpsConsentGranted?: boolean;
  driverLat?: number;
  driverLng?: number;
  cancelOrFailReason?: string;
}): Promise<void> {
  if (!canTransitionEmergency(params.emergency.status, params.toStatus)) {
    throw new Error(`Invalid emergency FSM transition: ${params.emergency.status} -> ${params.toStatus}`);
  }

  const emgRef = doc(db, 'emergencies', params.emergency.emergencyId);
  const eventId = newId('eev');
  const auditId = newId('aud');
  const batch = writeBatch(db);

  const updates: Record<string, unknown> = {
    status: params.toStatus,
    version: increment(1),
    updatedAt: serverTimestamp(),
  };

  if (params.assignedAmbulanceId) updates.assignedAmbulanceId = params.assignedAmbulanceId;
  if (params.assignedDriverUid) updates.assignedDriverUid = params.assignedDriverUid;
  if (params.destinationFacilityId) updates.destinationFacilityId = params.destinationFacilityId;
  if (params.destinationFacilityName) updates.destinationFacilityName = params.destinationFacilityName.slice(0, 200);
  if (typeof params.etaMinutes === 'number') updates.etaMinutes = params.etaMinutes;
  if (typeof params.gpsConsentGranted === 'boolean') updates.gpsConsentGranted = params.gpsConsentGranted;
  if (typeof params.driverLat === 'number') {
    updates.driverLat = params.driverLat;
    updates.driverGpsUpdatedAt = new Date().toISOString();
  }
  if (typeof params.driverLng === 'number') updates.driverLng = params.driverLng;
  if (params.cancelOrFailReason) updates.cancelOrFailReason = params.cancelOrFailReason.slice(0, 500);

  batch.update(emgRef, updates);

  // Sync demo ambulance unit availability when proposing/accepting/closing
  if (params.assignedAmbulanceId && params.emergency.tenantId === 'demo-maharashtra') {
    const ambStatus =
      params.toStatus === 'dispatch_proposed'
        ? 'proposed'
        : params.toStatus === 'driver_rejected' || params.toStatus === 'closed' || params.toStatus === 'cancelled'
          ? 'available'
          : 'assigned';
    batch.update(doc(db, 'ambulances', params.assignedAmbulanceId), {
      status: ambStatus,
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(doc(db, 'emergencies', params.emergency.emergencyId, 'events', eventId), {
    eventId,
    emergencyId: params.emergency.emergencyId,
    fromStatus: params.emergency.status,
    toStatus: params.toStatus,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    note: (params.note || params.cancelOrFailReason || `Transitioned to ${params.toStatus}`).slice(0, 500),
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId: params.emergency.tenantId,
    actorUid: params.actorUid,
    actorRole: params.actorRole,
    action: `EMERGENCY_${params.toStatus.toUpperCase()}`,
    resourceType: 'emergency',
    resourceId: params.emergency.emergencyId,
    reason: (params.note || params.cancelOrFailReason || 'Emergency dispatch workflow').slice(0, 500),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `emergencies/${params.emergency.emergencyId}`);
  }
}

export function subscribeEmergencies(
  tenantId: TenantId,
  uid: string | null,
  canViewAllInTenant: boolean,
  onData: (items: EmergencyRecord[]) => void,
  onError: (err: Error) => void
) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  const q = canViewAllInTenant
    ? query(collection(db, 'emergencies'), where('tenantId', '==', tenantId), limit(40))
    : query(collection(db, 'emergencies'), where('patientUid', '==', uid), limit(40));

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => d.data() as EmergencyRecord)
        .filter((e) => e.tenantId === tenantId)
        .sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt));
      onData(rows);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'emergencies');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export function subscribeAmbulances(
  tenantId: TenantId,
  isAuthed: boolean,
  onData: (items: AmbulanceUnit[]) => void,
  onError: (err: Error) => void
) {
  if (!isAuthed) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'ambulances'), where('tenantId', '==', tenantId), limit(30));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as AmbulanceUnit));
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'ambulances');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function loadUserPrivateInfo(uid: string): Promise<Record<string, string>> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'private', 'info'));
    return snap.exists() ? (snap.data() as Record<string, string>) : {};
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/private/info`);
  }
}

export async function saveUserPrivateInfo(uid: string, info: Record<string, string>): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', uid, 'private', 'info'),
      {
        uid,
        email: (info.email || '').slice(0, 200),
        phone: (info.phone || '').slice(0, 30),
        village: (info.village || '').slice(0, 120),
        taluka: (info.taluka || '').slice(0, 120),
        district: (info.district || '').slice(0, 120),
        bloodGroup: (info.bloodGroup || '').slice(0, 12),
        allergies: (info.allergies || '').slice(0, 500),
        medications: (info.medications || '').slice(0, 500),
        emergencyContactName: (info.emergencyContactName || '').slice(0, 120),
        emergencyContactPhone: (info.emergencyContactPhone || '').slice(0, 30),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
  }
}

export function subscribeConsents(uid: string | null, onData: (items: ConsentRecord[]) => void) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  return onSnapshot(collection(db, 'users', uid, 'consents'), (snap) => {
    onData(snap.docs.map((d) => d.data() as ConsentRecord));
  });
}

export async function toggleConsent(uid: string, purpose: ConsentPurpose, granted: boolean): Promise<void> {
  const consentId = `consent-${purpose}`;
  try {
    await setDoc(doc(db, 'users', uid, 'consents', consentId), {
      consentId,
      uid,
      purpose,
      granted,
      version: 'dpdp-2026-v1',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/consents/${consentId}`);
  }
}

export function subscribeDependents(uid: string | null, onData: (items: DependentRecord[]) => void) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  return onSnapshot(collection(db, 'users', uid, 'dependents'), (snap) => {
    onData(snap.docs.map((d) => d.data() as DependentRecord));
  });
}

export async function addDependent(
  uid: string,
  payload: { name: string; relationship: string; ageYears: number; guardianConfirmed: boolean }
): Promise<void> {
  const dependentId = newId('dep');
  try {
    await setDoc(doc(db, 'users', uid, 'dependents', dependentId), {
      dependentId,
      guardianUid: uid,
      name: payload.name.slice(0, 120),
      relationship: payload.relationship.slice(0, 60),
      ageYears: payload.ageYears,
      guardianConfirmed: payload.guardianConfirmed,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/dependents/${dependentId}`);
  }
}

export async function removeDependent(uid: string, dependentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', uid, 'dependents', dependentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/dependents/${dependentId}`);
  }
}

export function subscribeHealthRecords(uid: string | null, onData: (items: HealthRecordItem[]) => void) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, 'users', uid, 'records'), orderBy('createdAt', 'desc'), limit(40)),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as HealthRecordItem));
    }
  );
}

export async function addHealthRecord(
  uid: string,
  payload: {
    title: string;
    category: HealthRecordItem['category'];
    summary: string;
    facilityName?: string;
    recordedDate: string;
  }
): Promise<void> {
  const recordId = newId('rec');
  try {
    await setDoc(doc(db, 'users', uid, 'records', recordId), {
      recordId,
      uid,
      title: payload.title.slice(0, 180),
      category: payload.category,
      summary: payload.summary.slice(0, 1500),
      ...(payload.facilityName ? { facilityName: payload.facilityName.slice(0, 180) } : {}),
      recordedDate: payload.recordedDate,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/records/${recordId}`);
  }
}

export async function submitDsrRequest(uid: string, type: 'export' | 'deletion'): Promise<string> {
  const requestId = newId('dsr');
  try {
    await setDoc(doc(db, 'users', uid, 'dsr_requests', requestId), {
      requestId,
      uid,
      type,
      status: 'submitted',
      createdAt: serverTimestamp(),
    });
    return requestId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/dsr_requests/${requestId}`);
  }
}

export function subscribeFollowUps(
  tenantId: TenantId,
  uid: string | null,
  canViewAllInTenant: boolean,
  onData: (items: FollowUpItem[]) => void
) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  const q = canViewAllInTenant
    ? query(collection(db, 'follow_ups'), where('tenantId', '==', tenantId), limit(50))
    : query(collection(db, 'follow_ups'), where('patientUid', '==', uid), limit(50));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs
      .map((d) => d.data() as FollowUpItem)
      .filter((f) => f.tenantId === tenantId)
      .sort((a, b) => toEpochMs(b.updatedAt) - toEpochMs(a.updatedAt));
    onData(rows);
  });
}

export async function createFollowUpTask(params: {
  tenantId: TenantId;
  patientUid: string;
  workerUid?: string;
  referralId?: string;
  title: string;
  dueDate: string;
  notes?: string;
}): Promise<void> {
  const followUpId = newId('fup');
  try {
    await setDoc(doc(db, 'follow_ups', followUpId), {
      followUpId,
      tenantId: params.tenantId,
      patientUid: params.patientUid,
      ...(params.workerUid ? { workerUid: params.workerUid } : {}),
      ...(params.referralId ? { referralId: params.referralId } : {}),
      title: params.title.slice(0, 180),
      dueDate: params.dueDate,
      status: 'pending',
      ...(params.notes ? { notes: params.notes.slice(0, 500) } : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `follow_ups/${followUpId}`);
  }
}

export async function updateFollowUpStatus(followUpId: string, status: FollowUpItem['status'], notes?: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'follow_ups', followUpId), {
      status,
      ...(notes ? { notes: notes.slice(0, 500) } : {}),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `follow_ups/${followUpId}`);
  }
}

export function subscribeAuditLogs(
  tenantId: TenantId,
  canRead: boolean,
  onData: (items: AuditLogItem[]) => void
) {
  if (!canRead) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'audit_logs'), where('tenantId', '==', tenantId), limit(60));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs
      .map((d) => d.data() as AuditLogItem)
      .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));
    onData(rows);
  });
}

export async function logAuditEvent(params: {
  tenantId: TenantId;
  actorUid: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason?: string;
}): Promise<void> {
  const auditId = newId('aud');
  try {
    await setDoc(doc(db, 'audit_logs', auditId), {
      auditId,
      tenantId: params.tenantId,
      actorUid: params.actorUid,
      actorRole: params.actorRole.slice(0, 60),
      action: params.action.slice(0, 120),
      resourceType: params.resourceType.slice(0, 80),
      resourceId: params.resourceId.slice(0, 128),
      ...(params.reason ? { reason: params.reason.slice(0, 500) } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `audit_logs/${auditId}`);
  }
}

export async function grantStaffRole(params: {
  targetUid: string;
  role: string;
  actorUid: string;
  tenantId: TenantId;
  facilityId?: string;
}): Promise<void> {
  const auditId = newId('aud');
  const batch = writeBatch(db);
  batch.set(doc(db, 'role_grants', params.targetUid), {
    uid: params.targetUid,
    role: params.role,
    status: 'active',
    ...(params.facilityId ? { facilityId: params.facilityId } : {}),
    grantedByUid: params.actorUid,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'audit_logs', auditId), {
    auditId,
    tenantId: params.tenantId,
    actorUid: params.actorUid,
    actorRole: 'platform_admin',
    action: 'ROLE_GRANT_UPDATED',
    resourceType: 'role_grant',
    resourceId: params.targetUid,
    reason: `Assigned role=${params.role}`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `role_grants/${params.targetUid}`);
  }
}

export function subscribeAiSessions(
  uid: string | null,
  onData: (items: AiSessionRecord[]) => void,
  onError?: (err: Error) => void
) {
  if (!uid) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'users', uid, 'ai_sessions'), orderBy('updatedAt', 'desc'), limit(20));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as AiSessionRecord));
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/ai_sessions`);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export function subscribeAiMessages(
  uid: string | null,
  sessionId: string | null,
  onData: (items: AiMessageRecord[]) => void,
  onError?: (err: Error) => void
) {
  if (!uid || !sessionId) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, 'users', uid, 'ai_sessions', sessionId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const parsed: AiMessageRecord[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const rawCitations = Array.isArray(raw.citations) ? raw.citations : [];
        const citations: AiCitation[] = rawCitations
          .map((entry) => {
            if (typeof entry !== 'string') return null;
            try {
              return JSON.parse(entry) as AiCitation;
            } catch {
              return null;
            }
          })
          .filter((c): c is AiCitation => Boolean(c && c.uri));
        return {
          messageId: String(raw.messageId ?? d.id),
          sessionId: String(raw.sessionId ?? sessionId),
          uid: String(raw.uid ?? uid),
          role: raw.role === 'assistant' ? 'assistant' : 'user',
          text: String(raw.text ?? ''),
          model: typeof raw.model === 'string' ? raw.model : undefined,
          thinkingLevel: typeof raw.thinkingLevel === 'string' ? raw.thinkingLevel : undefined,
          groundingMode:
            raw.groundingMode === 'maps' || raw.groundingMode === 'search' ? raw.groundingMode : 'none',
          citations,
          createdAt: raw.createdAt,
        };
      });
      onData(parsed);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/ai_sessions/${sessionId}/messages`);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    }
  );
}

export async function createAiSession(params: {
  uid: string;
  title: string;
  modelMode: AiModelMode;
  groundingMode: AiGroundingMode;
  persona: AiPersona;
}): Promise<string> {
  const sessionId = newId('ais');
  try {
    await setDoc(doc(db, 'users', params.uid, 'ai_sessions', sessionId), {
      sessionId,
      uid: params.uid,
      title: params.title.slice(0, 160) || 'RAKSHA Navigation Chat',
      modelMode: params.modelMode,
      groundingMode: params.groundingMode,
      persona: params.persona,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return sessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${params.uid}/ai_sessions/${sessionId}`);
  }
}

export async function updateAiSessionMeta(params: {
  uid: string;
  sessionId: string;
  title: string;
  modelMode: AiModelMode;
  groundingMode: AiGroundingMode;
  persona: AiPersona;
}): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', params.uid, 'ai_sessions', params.sessionId),
      {
        title: params.title.slice(0, 160),
        modelMode: params.modelMode,
        groundingMode: params.groundingMode,
        persona: params.persona,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${params.uid}/ai_sessions/${params.sessionId}`);
  }
}

export async function appendAiMessage(params: {
  uid: string;
  sessionId: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  thinkingLevel?: string;
  groundingMode?: AiGroundingMode;
  citations?: AiCitation[];
}): Promise<string> {
  const messageId = newId('aim');
  const encodedCitations = (params.citations ?? []).slice(0, 20).map((c) => JSON.stringify(c));
  try {
    await setDoc(doc(db, 'users', params.uid, 'ai_sessions', params.sessionId, 'messages', messageId), {
      messageId,
      sessionId: params.sessionId,
      uid: params.uid,
      role: params.role,
      text: params.text.slice(0, 8000),
      ...(params.model ? { model: params.model.slice(0, 64) } : {}),
      ...(params.thinkingLevel ? { thinkingLevel: params.thinkingLevel.slice(0, 32) } : {}),
      ...(params.groundingMode ? { groundingMode: params.groundingMode } : {}),
      ...(encodedCitations.length > 0 ? { citations: encodedCitations } : {}),
      createdAt: serverTimestamp(),
    });
    return messageId;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `users/${params.uid}/ai_sessions/${params.sessionId}/messages/${messageId}`
    );
  }
}

export async function deleteAiSession(uid: string, sessionId: string): Promise<void> {
  try {
    const msgs = await getDocs(collection(db, 'users', uid, 'ai_sessions', sessionId, 'messages'));
    const batch = writeBatch(db);
    msgs.docs.forEach((m) => batch.delete(m.ref));
    batch.delete(doc(db, 'users', uid, 'ai_sessions', sessionId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}/ai_sessions/${sessionId}`);
  }
}
