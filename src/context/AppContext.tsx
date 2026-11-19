import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase.ts';
import { LanguageCode, TenantId, UserRole } from '../shared/types.ts';
import { computeWsReconnectDelayMs, MAX_WS_RECONNECT_ATTEMPTS } from '../shared/wsPolicy.ts';

export type WsConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'failed';

export type AppSection =
  | 'home'
  | 'find_care'
  | 'triage'
  | 'emergency'
  | 'referrals'
  | 'records'
  | 'follow_ups'
  | 'family'
  | 'portals'
  | 'assistant'
  | 'network_3d'
  | 'compliance';

export type PortalTab = 'frontline' | 'dispatcher' | 'driver' | 'hospital' | 'admin';

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  verifiedRole: UserRole;
  activeRole: UserRole;
  setDemoPersonaRole: (role: UserRole) => void;
  tenantId: TenantId;
  setTenantId: (tenant: TenantId) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  simplifiedMode: boolean;
  setSimplifiedMode: (v: boolean) => void;
  lowDataMode: boolean;
  setLowDataMode: (v: boolean) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  activeSection: AppSection;
  setActiveSection: (s: AppSection) => void;
  activePortalTab: PortalTab;
  setActivePortalTab: (tab: PortalTab) => void;
  wsConnected: boolean;
  wsState: WsConnectionState;
  lastWsEvent: { event: string; payload: Record<string, unknown>; timestamp: string } | null;
  broadcastWsEvent: (event: string, payload: Record<string, unknown>) => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getAuthHeader: () => Promise<Record<string, string>>;
  gmpQuotaExceeded: boolean;
  firestoreOffline: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [verifiedRole, setVerifiedRole] = useState<UserRole>('patient');
  const [demoRole, setDemoRole] = useState<UserRole>('patient');
  const [tenantId, setTenantIdState] = useState<TenantId>('mh-live');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [darkMode, setDarkMode] = useState(false);
  const [simplifiedMode, setSimplifiedMode] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('home');
  const [activePortalTab, setActivePortalTab] = useState<PortalTab>('hospital');
  const [wsState, setWsState] = useState<WsConnectionState>('idle');
  const wsConnected = wsState === 'connected';
  const [lastWsEvent, setLastWsEvent] = useState<{
    event: string;
    payload: Record<string, unknown>;
    timestamp: string;
  } | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [firestoreOffline, setFirestoreOffline] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Sync HTML classes for dark mode, simplified mode, and reduced motion
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.classList.toggle('raksha-simplified', simplifiedMode);
    root.classList.toggle('raksha-reduced-motion', reducedMotion);
  }, [darkMode, simplifiedMode, reducedMotion]);

  // Listen for Google Maps Platform quota events (Case A)
  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Auth state & user document sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const probe = await testFirestoreConnection();
        setFirestoreOffline(probe.offline);

        // Sync public-safe user metadata (strictly role: 'patient' on initial create)
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              displayName: (firebaseUser.displayName || 'Citizen User').slice(0, 120),
              role: 'patient',
              tenantId: 'mh-live',
              preferredLanguage: language,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            setVerifiedRole('patient');
          } else {
            const data = snap.data() as { role?: UserRole };
            setVerifiedRole(data.role ?? 'patient');
          }

          // Check verified staff role_grants
          const grantSnap = await getDoc(doc(db, 'role_grants', firebaseUser.uid));
          if (grantSnap.exists()) {
            const grantData = grantSnap.data() as { role?: UserRole; status?: string };
            if (grantData.status === 'active' && grantData.role) {
              setVerifiedRole(grantData.role);
            }
          }
        } catch (err) {
          console.warn('User profile sync note:', err);
        }
      } else {
        setVerifiedRole('patient');
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // WebSocket client connection for real-time coordination with bounded backoff
  useEffect(() => {
    if (!authReady) return;

    // In live mode without sign-in, rely on public polling rather than opening unauthorized mh-live WS
    if (tenantId === 'mh-live' && !user) {
      setWsState('idle');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setWsState('offline');
        return;
      }
      if (reconnectAttempt >= MAX_WS_RECONNECT_ATTEMPTS) {
        setWsState('failed');
        return;
      }
      const delayMs = computeWsReconnectDelayMs(reconnectAttempt);
      reconnectAttempt += 1;
      setWsState('reconnecting');
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delayMs);
    };

    const connect = async () => {
      if (disposed) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setWsState('offline');
        return;
      }

      setWsState((prev) => (prev === 'reconnecting' ? 'reconnecting' : 'connecting'));

      let tokenParam = '';
      if (user) {
        try {
          const token = await user.getIdToken();
          if (disposed) return;
          if (token) {
            tokenParam = `?token=${encodeURIComponent(token)}`;
          }
        } catch {
          if (disposed) return;
          if (tenantId === 'mh-live') {
            scheduleReconnect();
            return;
          }
        }
      }

      if (disposed) return;

      const wsUrl = `${protocol}//${window.location.host}/ws${tokenParam}`;
      try {
        const nextSocket = new WebSocket(wsUrl);
        socket = nextSocket;
        wsRef.current = nextSocket;

        nextSocket.onopen = () => {
          if (disposed) {
            nextSocket.close();
            return;
          }
          reconnectAttempt = 0;
          setWsState('connected');
          try {
            nextSocket.send(JSON.stringify({ type: 'subscribe', tenantId }));
          } catch {
            // ignore send failure
          }
        };

        nextSocket.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(String(evt.data));
            if (parsed.type === 'event') {
              setLastWsEvent({
                event: String(parsed.event),
                payload: parsed.payload ?? {},
                timestamp: String(parsed.timestamp ?? new Date().toISOString()),
              });
            }
          } catch {
            // ignore malformed ws message
          }
        };

        nextSocket.onclose = () => {
          if (wsRef.current === nextSocket) {
            wsRef.current = null;
          }
          if (!disposed) {
            scheduleReconnect();
          }
        };

        nextSocket.onerror = () => {
          setWsState((cur) => (cur === 'connected' ? 'reconnecting' : cur));
        };
      } catch {
        if (!disposed) {
          scheduleReconnect();
        }
      }
    };

    const onOnline = () => {
      if (disposed) return;
      reconnectAttempt = 0;
      if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        clearReconnectTimer();
        void connect();
      }
    };

    const onOffline = () => {
      clearReconnectTimer();
      setWsState('offline');
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    void connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (socket) {
        if (wsRef.current === socket) {
          wsRef.current = null;
        }
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          try {
            socket.close(1000, 'Client cleanup');
          } catch {
            // ignore close errors
          }
        }
      }
    };
  }, [tenantId, user?.uid, authReady]);

  const broadcastWsEvent = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'broadcast', tenantId, event, payload }));
      }
    },
    [tenantId]
  );

  const setTenantId = useCallback((nextTenant: TenantId) => {
    setTenantIdState(nextTenant);
    if (nextTenant === 'mh-live') {
      setDemoRole('patient');
    }
  }, []);

  const setDemoPersonaRole = useCallback(
    (role: UserRole) => {
      if (tenantId !== 'demo-maharashtra') return;
      setDemoRole(role);
    },
    [tenantId]
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleAuthProvider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setDemoRole('patient');
    setTenantIdState('mh-live');
  }, []);

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    if (!auth.currentUser) return {};
    try {
      const token = await auth.currentUser.getIdToken();
      return { Authorization: `Bearer ${token}` };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'auth/idToken');
    }
  }, []);

  const activeRole: UserRole = tenantId === 'demo-maharashtra' ? demoRole : verifiedRole;

  return (
    <AppContext.Provider
      value={{
        user,
        authReady,
        verifiedRole,
        activeRole,
        setDemoPersonaRole,
        tenantId,
        setTenantId,
        language,
        setLanguage,
        darkMode,
        setDarkMode,
        simplifiedMode,
        setSimplifiedMode,
        lowDataMode,
        setLowDataMode,
        reducedMotion,
        setReducedMotion,
        activeSection,
        setActiveSection,
        activePortalTab,
        setActivePortalTab,
        wsConnected,
        wsState,
        lastWsEvent,
        broadcastWsEvent,
        signInWithGoogle,
        logout,
        getAuthHeader,
        gmpQuotaExceeded,
        firestoreOffline,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
