import { AmbulanceUnit, FacilityRecord, FacilityType } from './types.ts';

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function isFreshnessExpired(sourceTimestamp: string, ttlSeconds: number, nowMs = Date.now()): boolean {
  if (!sourceTimestamp || ttlSeconds <= 0) return true;
  const parsed = Date.parse(sourceTimestamp);
  if (Number.isNaN(parsed)) return true;
  return nowMs - parsed > ttlSeconds * 1000;
}

const CARE_LEVEL_RANK: Record<FacilityType, number> = {
  PHC: 1,
  RH: 2,
  SDH: 3,
  DH: 4,
  MC: 5,
  PRIVATE: 3,
};

export interface RankedFacility {
  facility: FacilityRecord;
  distanceKm: number;
  estimatedDriveMinutes: number;
  score: number;
  isStale: boolean;
  reasons: string[];
}

export function rankFacilities(
  facilities: FacilityRecord[],
  origin: { lat: number; lng: number },
  requiredLevel: FacilityType = 'PHC',
  emergencyOnly = false
): RankedFacility[] {
  const reqRank = CARE_LEVEL_RANK[requiredLevel];

  return facilities
    .filter((f) => (!emergencyOnly ? true : f.emergencyCapable))
    .map((facility) => {
      const distanceKm = haversineKm(origin.lat, origin.lng, facility.lat, facility.lng);
      const estimatedDriveMinutes = Math.max(4, Math.round((distanceKm / 38) * 60));
      const isStale = isFreshnessExpired(facility.source_timestamp, facility.freshness_ttl);
      const levelRank = CARE_LEVEL_RANK[facility.type];

      let score = 100;
      const reasons: string[] = [];

      // Distance penalty
      score -= Math.min(55, distanceKm * 0.9);
      reasons.push(`${distanceKm.toFixed(1)} km (~${estimatedDriveMinutes} min est.)`);

      // Capability match
      if (levelRank >= reqRank) {
        score += 18;
        reasons.push(`Meets ${requiredLevel} care level (${facility.type})`);
      } else {
        score -= 22;
        reasons.push(`Below target ${requiredLevel} level (${facility.type})`);
      }

      // Provenance & freshness
      if (facility.verification_status === 'verified_live' && !isStale) {
        score += 12;
        reasons.push('Verified live capacity report');
      } else if (facility.verification_status === 'demo_fixture') {
        reasons.push('Demo fixture facility');
      } else if (isStale) {
        score -= 8;
        reasons.push('Capacity report expired — treated as Unknown');
      }

      if (facility.emergencyCapable) {
        score += 6;
      }

      return {
        facility,
        distanceKm,
        estimatedDriveMinutes,
        score: Math.round(score),
        isStale,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface RankedAmbulance {
  ambulance: AmbulanceUnit;
  distanceKm: number | null;
  etaMinutes: number | null;
  score: number;
  eligible: boolean;
  reasons: string[];
}

export function rankAmbulances(
  ambulances: AmbulanceUnit[],
  pickup: { lat?: number; lng?: number },
  requireAls = false
): RankedAmbulance[] {
  return ambulances
    .map((amb) => {
      const reasons: string[] = [];
      if (amb.status !== 'available') {
        return {
          ambulance: amb,
          distanceKm: null,
          etaMinutes: null,
          score: -1,
          eligible: false,
          reasons: [`Status is ${amb.status}`],
        };
      }

      let score = 70;
      if (amb.capability === 'ALS' || amb.capability === 'NEONATAL') {
        score += 20;
        reasons.push(`${amb.capability} life-support equipped`);
      } else if (requireAls) {
        score -= 15;
        reasons.push(`${amb.capability} (ALS requested)`);
      } else {
        reasons.push(`${amb.capability} unit`);
      }

      let distanceKm: number | null = null;
      let etaMinutes: number | null = null;

      if (
        typeof pickup.lat === 'number' &&
        typeof pickup.lng === 'number' &&
        typeof amb.lat === 'number' &&
        typeof amb.lng === 'number' &&
        amb.gpsConsentActive
      ) {
        distanceKm = haversineKm(pickup.lat, pickup.lng, amb.lat, amb.lng);
        etaMinutes = Math.max(5, Math.round((distanceKm / 42) * 60));
        score += Math.max(0, 30 - distanceKm * 0.6);
        reasons.push(`${distanceKm.toFixed(1)} km from pickup (~${etaMinutes} min est.)`);
      } else {
        reasons.push('GPS coordinates unavailable or consent inactive');
        score -= 15;
      }

      return {
        ambulance: amb,
        distanceKm,
        etaMinutes,
        score: Math.round(score),
        eligible: true,
        reasons,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
}
