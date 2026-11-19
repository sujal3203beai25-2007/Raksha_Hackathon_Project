export type WsTenantRoom = 'mh-live' | 'demo-maharashtra';

export const MAX_WS_RECONNECT_ATTEMPTS = 5;
export const WS_BASE_RECONNECT_DELAY_MS = 1500;
export const WS_MAX_RECONNECT_DELAY_MS = 30_000;

export function computeWsReconnectDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(
    WS_MAX_RECONNECT_DELAY_MS,
    WS_BASE_RECONNECT_DELAY_MS * Math.pow(2, safeAttempt)
  );
}

export function isAllowedWsTenant(value: unknown): value is WsTenantRoom {
  return value === 'mh-live' || value === 'demo-maharashtra';
}

export function isWsSubscriptionAuthorized(
  tenantId: WsTenantRoom,
  isAuthenticated: boolean
): boolean {
  if (tenantId === 'demo-maharashtra') return true;
  return isAuthenticated;
}

export function isWsBroadcastAuthorized(
  tenantId: WsTenantRoom,
  isAuthenticated: boolean
): boolean {
  if (tenantId === 'demo-maharashtra') return true;
  return isAuthenticated;
}
