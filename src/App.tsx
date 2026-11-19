import { AlertTriangle, PhoneCall } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AssistantView } from './components/AssistantView.tsx';
import { ComplianceView } from './components/ComplianceView.tsx';
import { EmergencyView } from './components/EmergencyView.tsx';
import { FacilityDiscoveryView } from './components/FacilityDiscoveryView.tsx';
import { HeaderNav } from './components/HeaderNav.tsx';
import { LandingView } from './components/LandingView.tsx';
import { MobileBottomBar } from './components/MobileBottomBar.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { PatientRecordsPortal } from './components/PatientRecordsPortal.tsx';
import { ReferralsView } from './components/ReferralsView.tsx';
import { RolePortalsView } from './components/RolePortalsView.tsx';
import { ThreeSceneView } from './components/ThreeSceneView.tsx';
import { TriageView } from './components/TriageView.tsx';
import { Button, ModalDialog } from './components/ui/Primitives.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { cacheFacilitiesLocally, getCachedFacilitiesLocally } from './lib/offlineDb.ts';
import {
  seedDemoTenantIfNeeded,
  subscribeAmbulances,
  subscribeAuditLogs,
  subscribeConsents,
  subscribeDependents,
  subscribeEmergencies,
  subscribeFacilities,
  subscribeFollowUps,
  subscribeHealthRecords,
  subscribeReferrals,
} from './services/firestoreService.ts';
import { t } from './shared/i18n.ts';
import { buildDemoFacilities, MAHARASHTRA_REFERENCE_FACILITIES } from './shared/seedData.ts';
import {
  AmbulanceUnit,
  AuditLogItem,
  ConsentRecord,
  DependentRecord,
  EmergencyRecord,
  FacilityRecord,
  FacilityType,
  FollowUpItem,
  HealthRecordItem,
  ReferralRecord,
} from './shared/types.ts';

const RakshaShell: React.FC = () => {
  const {
    user,
    tenantId,
    setTenantId,
    activeRole,
    verifiedRole,
    language,
    activeSection,
    setActiveSection,
    gmpQuotaExceeded,
  } = useApp();
  const copy = t(language);

  const [emergencyConfirmOpen, setEmergencyConfirmOpen] = useState(false);
  const [preselectedDest, setPreselectedDest] = useState<FacilityRecord | null>(null);
  const [triageTargetLevel, setTriageTargetLevel] = useState<FacilityType>('PHC');

  const [facilities, setFacilities] = useState<FacilityRecord[]>(MAHARASHTRA_REFERENCE_FACILITIES);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [emergencies, setEmergencies] = useState<EmergencyRecord[]>([]);
  const [ambulances, setAmbulances] = useState<AmbulanceUnit[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [dependents, setDependents] = useState<DependentRecord[]>([]);
  const [healthRecords, setHealthRecords] = useState<HealthRecordItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // Subscribe to Facilities with offline IndexedDB + static reference fallback
  useEffect(() => {
    setFacilitiesLoading(true);
    const baseline =
      tenantId === 'demo-maharashtra' ? buildDemoFacilities() : MAHARASHTRA_REFERENCE_FACILITIES;

    getCachedFacilitiesLocally()
      .then((cached) => {
        const filtered = cached.filter((c) => c.tenantId === tenantId);
        if (filtered.length > 0) setFacilities(filtered);
        else setFacilities(baseline);
      })
      .catch(() => setFacilities(baseline));

    const unsub = subscribeFacilities(
      tenantId,
      (rows) => {
        const merged = rows.length > 0 ? rows : baseline;
        setFacilities(merged);
        setFacilitiesLoading(false);
        cacheFacilitiesLocally(merged).catch(() => {});
      },
      () => {
        setFacilities(baseline);
        setFacilitiesLoading(false);
      }
    );
    return () => unsub();
  }, [tenantId]);

  // Subscribe to tenant-isolated operational collections when signed in
  useEffect(() => {
    const canViewAllInTenant =
      tenantId === 'demo-maharashtra' || verifiedRole !== 'patient';

    setReferralsLoading(Boolean(user));
    const unsubRef = subscribeReferrals(
      tenantId,
      user?.uid ?? null,
      canViewAllInTenant,
      (rows) => {
        setReferrals(rows);
        setReferralsLoading(false);
      },
      () => setReferralsLoading(false)
    );

    const unsubEmg = subscribeEmergencies(
      tenantId,
      user?.uid ?? null,
      canViewAllInTenant,
      setEmergencies,
      () => {}
    );

    const unsubAmb = subscribeAmbulances(tenantId, Boolean(user), setAmbulances, () => {});
    const unsubFup = subscribeFollowUps(tenantId, user?.uid ?? null, canViewAllInTenant, setFollowUps);
    const unsubAudit = subscribeAuditLogs(
      tenantId,
      Boolean(user) && (tenantId === 'demo-maharashtra' || verifiedRole === 'platform_admin' || verifiedRole === 'auditor'),
      setAuditLogs
    );

    return () => {
      unsubRef();
      unsubEmg();
      unsubAmb();
      unsubFup();
      unsubAudit();
    };
  }, [tenantId, user, verifiedRole, activeRole]);

  // Subscribe to private user subcollections
  useEffect(() => {
    const unsubConsents = subscribeConsents(user?.uid ?? null, setConsents);
    const unsubDeps = subscribeDependents(user?.uid ?? null, setDependents);
    const unsubRecs = subscribeHealthRecords(user?.uid ?? null, setHealthRecords);
    return () => {
      unsubConsents();
      unsubDeps();
      unsubRecs();
    };
  }, [user]);

  const handleSwitchToDemo = async () => {
    setTenantId('demo-maharashtra');
    if (user) {
      await seedDemoTenantIfNeeded(user.uid).catch(() => {});
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7FAFC] dark:bg-[#0B1523] text-[#10243A] dark:text-slate-100">
      <OfflineIndicator />

      {/* Google Maps Platform Case A Quota Exceeded Banner */}
      {gmpQuotaExceeded && (
        <div
          role="alert"
          className="bg-amber-100 dark:bg-amber-950 border-b border-amber-300 dark:border-amber-800 px-4 py-2.5 text-xs text-amber-950 dark:text-amber-100 flex flex-wrap items-center justify-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
          <span>
            Google Maps Platform demo quota reached for live map tiles — RAKSHA accessible text &amp; distance list remains active. Review{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              Google Maps Platform Quota Guidance
            </a>
            .
          </span>
        </div>
      )}

      <HeaderNav onOpenEmergencyModal={() => setEmergencyConfirmOpen(true)} />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-8 sm:pb-12">
        {activeSection === 'home' && (
          <LandingView onOpenEmergencyModal={() => setEmergencyConfirmOpen(true)} />
        )}

        {activeSection === 'find_care' && (
          <FacilityDiscoveryView
            facilities={facilities}
            loading={facilitiesLoading}
            initialRequiredLevel={triageTargetLevel}
            onStartReferral={(fac) => {
              setPreselectedDest(fac);
              setActiveSection('referrals');
            }}
          />
        )}

        {activeSection === 'triage' && (
          <TriageView
            onOpenEmergencyModal={() => setEmergencyConfirmOpen(true)}
            onFindFacilitiesForLevel={(level) => {
              setTriageTargetLevel(level);
              setActiveSection('find_care');
            }}
          />
        )}

        {activeSection === 'emergency' && (
          <EmergencyView
            emergencies={emergencies}
            facilities={facilities}
            onSwitchToDemo={() => void handleSwitchToDemo()}
          />
        )}

        {activeSection === 'referrals' && (
          <ReferralsView
            referrals={referrals}
            facilities={facilities}
            consents={consents}
            loading={referralsLoading}
            preselectedDestination={preselectedDest}
          />
        )}

        {(activeSection === 'records' || activeSection === 'follow_ups' || activeSection === 'family') && (
          <PatientRecordsPortal
            section={activeSection}
            consents={consents}
            dependents={dependents}
            healthRecords={healthRecords}
            followUps={followUps}
          />
        )}

        {activeSection === 'portals' && (
          <RolePortalsView
            facilities={facilities}
            referrals={referrals}
            emergencies={emergencies}
            ambulances={ambulances}
            auditLogs={auditLogs}
            onSwitchToDemo={() => void handleSwitchToDemo()}
          />
        )}

        {activeSection === 'assistant' && <AssistantView />}

        {activeSection === 'network_3d' && <ThreeSceneView />}

        {activeSection === 'compliance' && <ComplianceView />}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pb-mobile-nav-clearance">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="leading-relaxed">
            <strong>RAKSHA</strong> · {copy.brandTagline} · Pilot coordination software — not a replacement for physicians or 108 / 112.
          </div>
          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <button
              onClick={() => setActiveSection('compliance')}
              className="hover:underline font-medium text-[#087F8C] dark:text-[#16B8C5] min-h-[36px] inline-flex items-center cursor-pointer"
            >
              DPDP Privacy &amp; Safety Notice
            </button>
            <a
              href="/api/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline min-h-[36px] inline-flex items-center"
            >
              OpenAPI Spec
            </a>
            <a href="tel:108" className="font-semibold text-[#C81E1E] hover:underline min-h-[36px] inline-flex items-center">
              Dial 108 / 112
            </a>
          </div>
        </div>
      </footer>

      <MobileBottomBar onOpenEmergencyModal={() => setEmergencyConfirmOpen(true)} />

      {/* Anti-Accidental Emergency Confirmation Modal */}
      <ModalDialog
        open={emergencyConfirmOpen}
        onOpenChange={setEmergencyConfirmOpen}
        title={copy.emergencyConfirmTitle}
        description={copy.emergencyConfirmBody}
      >
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <a
              href="tel:108"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C81E1E] px-4 min-h-[48px] text-sm font-bold text-white hover:bg-[#A61717]"
            >
              <PhoneCall className="h-4 w-4" />
              {copy.call108Now}
            </a>
            <a
              href="tel:112"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#C81E1E] px-4 min-h-[48px] text-sm font-bold text-[#C81E1E] hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <PhoneCall className="h-4 w-4" />
              {copy.call112Now}
            </a>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEmergencyConfirmOpen(false)}>
              {copy.cancel}
            </Button>
            <Button
              variant="emergency"
              className="w-full sm:w-auto"
              onClick={() => {
                setEmergencyConfirmOpen(false);
                setActiveSection('emergency');
              }}
            >
              {copy.emergencyConfirmButton}
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <RakshaShell />
    </AppProvider>
  );
}
