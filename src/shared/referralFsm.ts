import { EmergencyStatus, ReferralStatus } from './types.ts';

export const TERMINAL_REFERRAL_STATES: readonly ReferralStatus[] = [
  'completed',
  'cancelled',
  'rejected',
  'expired',
];

export const REFERRAL_TRANSITIONS: Record<ReferralStatus, readonly ReferralStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'accepted', 'rejected', 'cancelled', 'expired'],
  under_review: ['accepted', 'rejected', 'cancelled', 'expired'],
  accepted: ['transfer_arranged', 'in_transit', 'cancelled'],
  transfer_arranged: ['in_transit', 'arrived', 'cancelled'],
  in_transit: ['arrived', 'handed_over', 'cancelled'],
  arrived: ['handed_over', 'completed'],
  handed_over: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
  expired: [],
};

export function canTransitionReferral(from: ReferralStatus, to: ReferralStatus): boolean {
  if (from === to) return false;
  return REFERRAL_TRANSITIONS[from].includes(to);
}

export const TERMINAL_EMERGENCY_STATES: readonly EmergencyStatus[] = [
  'closed',
  'cancelled',
];

export const EMERGENCY_TRANSITIONS: Record<EmergencyStatus, readonly EmergencyStatus[]> = {
  pending_validation: ['acknowledged', 'no_ambulance_available', 'cancelled'],
  acknowledged: ['dispatch_proposed', 'no_ambulance_available', 'cancelled'],
  dispatch_proposed: ['driver_accepted', 'driver_rejected', 'no_ambulance_available', 'cancelled'],
  driver_rejected: ['dispatch_proposed', 'no_ambulance_available', 'cancelled'],
  driver_accepted: ['en_route_to_patient', 'dispatch_proposed', 'cancelled'],
  en_route_to_patient: ['arrived_at_pickup', 'dispatch_proposed', 'cancelled'],
  arrived_at_pickup: ['patient_onboard', 'cancelled'],
  patient_onboard: ['en_route_to_hospital', 'hospital_acknowledged'],
  en_route_to_hospital: ['hospital_acknowledged', 'arrived_at_hospital'],
  hospital_acknowledged: ['arrived_at_hospital', 'handed_over'],
  arrived_at_hospital: ['handed_over', 'closed'],
  handed_over: ['closed'],
  no_ambulance_available: ['dispatch_proposed', 'acknowledged', 'closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export function canTransitionEmergency(from: EmergencyStatus, to: EmergencyStatus): boolean {
  if (from === to) return false;
  return EMERGENCY_TRANSITIONS[from].includes(to);
}
