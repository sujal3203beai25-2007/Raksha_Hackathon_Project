export type LanguageCode = 'en' | 'hi' | 'mr';

export type TenantId = 'mh-live' | 'demo-maharashtra';

export type UserRole =
  | 'patient'
  | 'caregiver'
  | 'frontline_worker'
  | 'ambulance_driver'
  | 'dispatcher'
  | 'hospital_coordinator'
  | 'clinician'
  | 'facility_admin'
  | 'org_admin'
  | 'platform_admin'
  | 'auditor';

export type FacilityType = 'PHC' | 'RH' | 'SDH' | 'DH' | 'MC' | 'PRIVATE';
export type FacilityCategory = 'public' | 'private' | 'trust';
export type VerificationStatus = 'verified_live' | 'cached' | 'unverified' | 'demo_fixture';
export type OxygenStatus = 'verified_available' | 'limited' | 'unavailable' | 'unknown';

export interface FacilityRecord {
  facilityId: string;
  tenantId: TenantId;
  name: string;
  nameHi?: string;
  nameMr?: string;
  type: FacilityType;
  category: FacilityCategory;
  district: string;
  taluka: string;
  address?: string;
  lat: number;
  lng: number;
  phone?: string;
  hours24x7: boolean;
  emergencyCapable: boolean;
  wheelchairAccessible: boolean;
  specialties?: string[];
  diagnostics?: string[];
  data_source: string;
  source_timestamp: string;
  verification_status: VerificationStatus;
  freshness_ttl: number; // seconds
  last_updated_by?: string;
  icuBedsAvailable?: number;
  generalBedsAvailable?: number;
  oxygenAvailable?: OxygenStatus;
  updatedAt?: unknown;
}

export type TriageUrgency = 'emergency' | 'urgent' | 'routine' | 'human_review';

export interface TriageResult {
  ruleVersion: string;
  urgency: TriageUrgency;
  redFlags: string[];
  symptoms: string[];
  recommendedCareLevel: FacilityType;
  rationale: string;
  humanReviewRequired: boolean;
  nonDiagnosticNotice: string;
}

export type ReferralStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'transfer_arranged'
  | 'in_transit'
  | 'arrived'
  | 'handed_over'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type ReferralUrgency = 'emergency' | 'urgent' | 'routine';

export interface ReferralRecord {
  referralId: string;
  tenantId: TenantId;
  patientUid: string;
  patientDisplayName: string;
  createdByUid: string;
  originFacilityId: string;
  originFacilityName: string;
  destinationFacilityId: string;
  destinationFacilityName: string;
  urgency: ReferralUrgency;
  status: ReferralStatus;
  version: number;
  idempotencyKey: string;
  consentId?: string;
  reason: string;
  clinicalSummary: string;
  aiSummaryPendingReview?: boolean;
  aiSummaryText?: string;
  qrToken?: string;
  qrExpiresAt?: string;
  escalationDeadline?: string;
  rejectionOrCancelReason?: string;
  assignedClinicianUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReferralEventRecord {
  eventId: string;
  referralId: string;
  fromStatus: string;
  toStatus: string;
  actorUid: string;
  actorRole: string;
  note?: string;
  createdAt?: unknown;
}

export type EmergencyStatus =
  | 'pending_validation'
  | 'acknowledged'
  | 'dispatch_proposed'
  | 'driver_accepted'
  | 'driver_rejected'
  | 'en_route_to_patient'
  | 'arrived_at_pickup'
  | 'patient_onboard'
  | 'en_route_to_hospital'
  | 'hospital_acknowledged'
  | 'arrived_at_hospital'
  | 'handed_over'
  | 'closed'
  | 'cancelled'
  | 'no_ambulance_available';

export interface EmergencyRecord {
  emergencyId: string;
  tenantId: TenantId;
  patientUid: string;
  patientDisplayName: string;
  callbackNumber: string;
  locationMode?: 'gps' | 'manual';
  villageOrLandmark: string;
  lat?: number;
  lng?: number;
  symptoms?: string;
  status: EmergencyStatus;
  version: number;
  assignedAmbulanceId?: string;
  assignedDriverUid?: string;
  destinationFacilityId?: string;
  destinationFacilityName?: string;
  etaMinutes?: number;
  gpsConsentGranted?: boolean;
  driverLat?: number;
  driverLng?: number;
  driverGpsUpdatedAt?: string;
  cancelOrFailReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AmbulanceCapability = 'BLS' | 'ALS' | 'NEONATAL' | 'FIRST_RESPONDER';
export type AmbulanceStatus = 'available' | 'proposed' | 'assigned' | 'offline' | 'maintenance';

export interface AmbulanceUnit {
  ambulanceId: string;
  tenantId: TenantId;
  orgName: string;
  vehicleNumber: string;
  capability: AmbulanceCapability;
  status: AmbulanceStatus;
  driverUid?: string;
  driverName?: string;
  baseDistrict: string;
  lat?: number;
  lng?: number;
  gpsFreshnessAt?: string;
  gpsConsentActive?: boolean;
  isDemo: boolean;
  updatedAt?: unknown;
}

export type ConsentPurpose =
  | 'triage_sharing'
  | 'referral_sharing'
  | 'emergency_gps'
  | 'ai_summarization'
  | 'family_access';

export interface ConsentRecord {
  consentId: string;
  uid: string;
  purpose: ConsentPurpose;
  granted: boolean;
  version: string;
  updatedAt?: unknown;
}

export interface DependentRecord {
  dependentId: string;
  guardianUid: string;
  name: string;
  relationship: string;
  ageYears: number;
  guardianConfirmed: boolean;
  updatedAt?: unknown;
}

export interface HealthRecordItem {
  recordId: string;
  uid: string;
  title: string;
  category: 'prescription' | 'lab_report' | 'discharge_summary' | 'immunization' | 'self_note';
  summary: string;
  facilityName?: string;
  recordedDate: string;
  createdAt?: unknown;
}

export interface FollowUpItem {
  followUpId: string;
  tenantId: TenantId;
  patientUid: string;
  workerUid?: string;
  referralId?: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'missed';
  notes?: string;
  updatedAt?: unknown;
}

export interface AuditLogItem {
  auditId: string;
  tenantId: TenantId;
  actorUid: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason?: string;
  createdAt?: unknown;
}

export interface OfflineDraft {
  id: string;
  type: 'referral' | 'triage' | 'follow_up';
  tenantId: TenantId;
  payload: Record<string, unknown>;
  syncState: 'queued' | 'syncing' | 'conflict' | 'failed';
  createdAt: string;
  errorMessage?: string;
}

export type AiModelMode = 'balanced' | 'deep' | 'fast';
export type AiGroundingMode = 'none' | 'search' | 'maps';
export type AiPersona = 'navigator' | 'asha_helper' | 'emergency_prep';

export interface AiCitation {
  kind: 'maps' | 'web';
  title: string;
  uri: string;
  snippet?: string;
}

export interface AiSessionRecord {
  sessionId: string;
  uid: string;
  title: string;
  modelMode: AiModelMode;
  groundingMode: AiGroundingMode;
  persona: AiPersona;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiMessageRecord {
  messageId: string;
  sessionId: string;
  uid: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  thinkingLevel?: string;
  groundingMode?: AiGroundingMode;
  citations?: AiCitation[];
  createdAt?: unknown;
}
