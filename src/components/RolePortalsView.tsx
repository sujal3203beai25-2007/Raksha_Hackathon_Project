import {
  Activity,
  Building2,
  ClipboardCheck,
  Download,
  Lock,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  WifiOff,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { PortalTab, useApp } from '../context/AppContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { deleteOfflineDraft, listOfflineDrafts, saveOfflineDraft } from '../lib/offlineDb.ts';
import {
  createReferralRecord,
  grantStaffRole,
  logAuditEvent,
  transitionEmergencyStatus,
  transitionReferralStatus,
  updateFacilityCapacity,
} from '../services/firestoreService.ts';
import { rankAmbulances } from '../shared/ambulanceScoring.ts';
import { t } from '../shared/i18n.ts';
import { MAHARASHTRA_ACCESS_GAP_AGGREGATES } from '../shared/seedData.ts';
import {
  AmbulanceUnit,
  AuditLogItem,
  EmergencyRecord,
  FacilityRecord,
  OfflineDraft,
  OxygenStatus,
  ReferralRecord,
  UserRole,
} from '../shared/types.ts';
import { Button, EmptyState, SurfaceCard } from './ui/Primitives.tsx';

export const RolePortalsView: React.FC<{
  facilities: FacilityRecord[];
  referrals: ReferralRecord[];
  emergencies: EmergencyRecord[];
  ambulances: AmbulanceUnit[];
  auditLogs: AuditLogItem[];
  onSwitchToDemo: () => void;
}> = ({ facilities, referrals, emergencies, ambulances, auditLogs, onSwitchToDemo }) => {
  const {
    language,
    user,
    tenantId,
    activeRole,
    verifiedRole,
    setDemoPersonaRole,
    activePortalTab,
    setActivePortalTab,
    lowDataMode,
    signInWithGoogle,
    getAuthHeader,
    broadcastWsEvent,
  } = useApp();
  const isOnline = useOnlineStatus();
  const copy = t(language);

  // Shared-device quick lock for ASHA/ANM frontline devices
  const [deviceLocked, setDeviceLocked] = useState(false);

  // Frontline Offline Drafts
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [draftPatientName, setDraftPatientName] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [draftDestId, setDraftDestId] = useState('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Hospital Capacity Reporting state
  const [capFacId, setCapFacId] = useState('');
  const [capIcu, setCapIcu] = useState('2');
  const [capGen, setCapGen] = useState('12');
  const [capO2, setCapO2] = useState<OxygenStatus>('verified_available');
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [readinessChecks, setReadinessChecks] = useState<Record<string, boolean>>({});

  // Driver state
  const [driverGpsConsent, setDriverGpsConsent] = useState(true);
  const [incidentNote, setIncidentNote] = useState('');

  // Admin & Image Fallback states
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [targetUid, setTargetUid] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('hospital_coordinator');
  const [roleMsg, setRoleMsg] = useState<string | null>(null);
  const [hospitalImgFailed, setHospitalImgFailed] = useState(false);
  const [driverImgFailed, setDriverImgFailed] = useState(false);

  useEffect(() => {
    listOfflineDrafts().then(setDrafts).catch(() => {});
  }, []);

  useEffect(() => {
    if (facilities.length > 0 && !capFacId) setCapFacId(facilities[0].facilityId);
    if (facilities.length > 1 && !draftDestId) setDraftDestId(facilities[1].facilityId);
  }, [facilities, capFacId, draftDestId]);

  const portalTabs: Array<{ id: PortalTab; label: string; demoRole: UserRole }> = [
    { id: 'frontline', label: 'ASHA / Frontline', demoRole: 'frontline_worker' },
    { id: 'hospital', label: 'Hospital Desk', demoRole: 'hospital_coordinator' },
    { id: 'dispatcher', label: 'Dispatcher', demoRole: 'dispatcher' },
    { id: 'driver', label: 'Ambulance Driver', demoRole: 'ambulance_driver' },
    { id: 'admin', label: 'Admin & Analytics', demoRole: 'platform_admin' },
  ];

  const handleSelectTab = (tab: PortalTab, demoRole: UserRole) => {
    setActivePortalTab(tab);
    if (tenantId === 'demo-maharashtra') {
      setDemoPersonaRole(demoRole);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <SurfaceCard className="text-center space-y-4">
          <h1 className="text-xl font-bold text-[#10243A] dark:text-white">{copy.navPortals}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
            Sign in with Google to access Frontline ASHA, Hospital Coordinator, Dispatcher, Ambulance Driver, and Admin Analytics portals.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => void signInWithGoogle()}>{copy.signInGoogle}</Button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  if (deviceLocked) {
    return (
      <div className="max-w-md mx-auto py-12">
        <SurfaceCard className="text-center space-y-4">
          <Lock className="h-8 w-8 text-[#087F8C] mx-auto" />
          <h2 className="text-lg font-bold text-[#10243A] dark:text-white">Shared Device Quick Lock Active</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Patient forms and frontline queues are hidden while stepping away from a shared ASHA/PHC tablet.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => setDeviceLocked(false)}>Unlock Frontline Session</Button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  // Frontline handlers
  const handleQueueOfflineDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftPatientName.trim() || !draftReason.trim()) return;
    const dest = facilities.find((f) => f.facilityId === draftDestId) ?? facilities[0];
    const draft: OfflineDraft = {
      id: `draft-${Date.now()}`,
      type: 'referral',
      tenantId,
      payload: {
        patientDisplayName: draftPatientName.trim(),
        reason: draftReason.trim(),
        originFacilityId: facilities[0]?.facilityId || 'demo-phc-velhe',
        originFacilityName: facilities[0]?.name || 'PHC Origin',
        destinationFacilityId: dest?.facilityId || 'demo-sdh-bhor',
        destinationFacilityName: dest?.name || 'SDH Receiving',
      },
      syncState: 'queued',
      createdAt: new Date().toISOString(),
    };
    await saveOfflineDraft(draft);
    setDrafts(await listOfflineDrafts());
    setDraftPatientName('');
    setDraftReason('');
    setSyncMessage('Draft stored safely in IndexedDB offline queue.');
  };

  const handleSyncDrafts = async () => {
    if (!isOnline) {
      setSyncMessage('Cannot sync while offline. Drafts remain safely queued.');
      return;
    }
    let synced = 0;
    for (const d of drafts) {
      try {
        await createReferralRecord({
          tenantId: d.tenantId,
          patientUid: user.uid,
          patientDisplayName: String(d.payload.patientDisplayName || 'Assisted Patient'),
          createdByUid: user.uid,
          actorRole: activeRole,
          originFacilityId: String(d.payload.originFacilityId),
          originFacilityName: String(d.payload.originFacilityName),
          destinationFacilityId: String(d.payload.destinationFacilityId),
          destinationFacilityName: String(d.payload.destinationFacilityName),
          urgency: 'urgent',
          reason: String(d.payload.reason),
          clinicalSummary: 'Synced from ASHA frontline IndexedDB offline draft queue.',
          initialStatus: 'submitted',
        });
        await deleteOfflineDraft(d.id);
        synced += 1;
      } catch {
        // Leave unsynced draft intact
      }
    }
    setDrafts(await listOfflineDrafts());
    setSyncMessage(`Synced ${synced} offline draft(s) to Firestore.`);
  };

  // Hospital capacity report handler
  const handlePublishCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capFacId) return;
    setCapMessage(null);
    try {
      await updateFacilityCapacity(
        capFacId,
        Math.max(0, Number(capIcu) || 0),
        Math.max(0, Number(capGen) || 0),
        capO2,
        user.uid,
        tenantId
      );
      broadcastWsEvent('facility:capacity_updated', { facilityId: capFacId, tenantId });
      setCapMessage('Verified capacity report published with fresh TTL timestamp & audit record.');
    } catch (err) {
      setCapMessage(err instanceof Error ? err.message : 'Capacity update requires verified staff/admin role in mh-live.');
    }
  };

  // Dispatcher handlers
  const handleProposeAmbulance = async (emg: EmergencyRecord, amb: AmbulanceUnit) => {
    const dest = facilities.find((f) => f.emergencyCapable) ?? facilities[0];
    try {
      if (emg.status === 'pending_validation') {
        await transitionEmergencyStatus({
          emergency: emg,
          toStatus: 'acknowledged',
          actorUid: user.uid,
          actorRole: activeRole,
          note: 'Dispatcher validated request',
        });
      }
      await transitionEmergencyStatus({
        emergency: {
          ...emg,
          status: emg.status === 'pending_validation' ? 'acknowledged' : emg.status,
          version: emg.status === 'pending_validation' ? emg.version + 1 : emg.version,
        },
        toStatus: 'dispatch_proposed',
        actorUid: user.uid,
        actorRole: activeRole,
        assignedAmbulanceId: amb.ambulanceId,
        assignedDriverUid: user.uid,
        destinationFacilityId: dest?.facilityId,
        destinationFacilityName: dest?.name,
        etaMinutes: 14,
        note: `Dispatcher proposed ${amb.vehicleNumber} (${amb.capability})`,
      });
      broadcastWsEvent('emergency:dispatch_proposed', { emergencyId: emg.emergencyId, ambulanceId: amb.ambulanceId });
    } catch {
      // ignore if already transitioned
    }
  };

  // Admin AI Operational Insight
  const handleGenerateInsight = async () => {
    setAiLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/ai/operational-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          metrics: MAHARASHTRA_ACCESS_GAP_AGGREGATES.map((d) => ({
            district: d.district,
            avgTravelMinutesToEmergency: d.avgTravelMinutesToEmergency,
            verifiedFreshnessPct: d.verifiedFreshnessPct,
            gapSeverity: d.gapSeverity,
          })),
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiInsight(data.error || 'AI operational insight unavailable.');
      } else {
        const recs = Array.isArray(data.recommendations)
          ? data.recommendations.map((r: string, i: number) => `${i + 1}. ${r}`).join(' ')
          : '';
        setAiInsight(`${data.summary || ''} ${recs}`.trim());
      }
    } catch {
      setAiInsight('Unable to fetch operational insight.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleExportAuditCsv = async () => {
    const header = 'auditId,tenantId,actorUid,actorRole,action,resourceType,resourceId,reason\n';
    const rows = auditLogs
      .map((a) =>
        [a.auditId, a.tenantId, a.actorUid, a.actorRole, a.action, a.resourceType, a.resourceId, a.reason || '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raksha-audit-${tenantId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await logAuditEvent({
      tenantId,
      actorUid: user.uid,
      actorRole: activeRole,
      action: 'AUDIT_CSV_EXPORTED',
      resourceType: 'audit_logs',
      resourceId: tenantId,
      reason: `Exported ${auditLogs.length} entries`,
    }).catch(() => {});
  };

  const handleGrantRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUid.trim()) return;
    try {
      await grantStaffRole({
        targetUid: targetUid.trim(),
        role: targetRole,
        actorUid: user.uid,
        tenantId,
      });
      setRoleMsg(`Granted role '${targetRole}' to UID ${targetUid.trim()} and logged audit entry.`);
      setTargetUid('');
    } catch (err) {
      setRoleMsg(err instanceof Error ? err.message : 'Only platform admins can grant live staff roles.');
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#10243A] dark:text-white tracking-tight">
            Operational &amp; Staff Portals
          </h1>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed break-words">
            Active Role: <strong>{activeRole}</strong> · Verified Live Role: <strong>{verifiedRole}</strong> · Tenant:{' '}
            <strong>{tenantId}</strong>
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Operational staff portals"
          className="flex items-center overflow-x-auto max-w-full rounded-xl bg-slate-200/75 dark:bg-slate-800 p-1 gap-1 border border-slate-200/80 dark:border-slate-700/60 shrink-0"
        >
          {portalTabs.map((tab) => {
            const active = activePortalTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectTab(tab.id, tab.demoRole)}
                className={`inline-flex items-center justify-center rounded-lg px-3 py-2 min-h-[44px] sm:min-h-[38px] text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#10243A] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* FRONTLINE ASHA / ANM PORTAL */}
      {activePortalTab === 'frontline' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
              ASHA / ANM Field Coordination &amp; Offline Draft Queue
            </h2>
            <Button variant="outline" size="sm" className="w-full sm:w-auto shrink-0" onClick={() => setDeviceLocked(true)}>
              <Lock className="h-4 w-4 shrink-0" />
              <span>Shared-Device Quick Lock</span>
            </Button>
          </div>

          <SurfaceCard>
            <h3 className="text-base font-semibold text-[#10243A] dark:text-white">
              Save Assisted Referral Draft (Works Offline in IndexedDB)
            </h3>
            <form onSubmit={handleQueueOfflineDraft} className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                type="text"
                required
                value={draftPatientName}
                onChange={(e) => setDraftPatientName(e.target.value)}
                placeholder="Patient name (with verbal/written consent)"
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <select
                value={draftDestId}
                onChange={(e) => setDraftDestId(e.target.value)}
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                {facilities.map((f) => (
                  <option key={f.facilityId} value={f.facilityId}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                value={draftReason}
                onChange={(e) => setDraftReason(e.target.value)}
                placeholder="Reason / maternal / fever warning"
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <div className="md:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => void handleSyncDrafts()}
                >
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  <span>Sync Queued Drafts ({drafts.length})</span>
                </Button>
                <Button type="submit" className="w-full sm:w-auto">
                  <WifiOff className="h-4 w-4 shrink-0" />
                  <span>Save to Offline Queue</span>
                </Button>
              </div>
            </form>
            {syncMessage && <p className="mt-2.5 text-xs text-[#087F8C] dark:text-[#16B8C5]">{syncMessage}</p>}

            {drafts.length > 0 && (
              <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 break-words leading-relaxed">
                      <strong>{String(d.payload.patientDisplayName)}</strong> →{' '}
                      {String(d.payload.destinationFacilityName)} · {String(d.payload.reason)}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="self-start sm:self-auto shrink-0"
                      onClick={async () => {
                        await deleteOfflineDraft(d.id);
                        setDrafts(await listOfflineDrafts());
                      }}
                    >
                      Discard
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>
      )}

      {/* HOSPITAL COORDINATOR PORTAL */}
      {activePortalTab === 'hospital' && (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 space-y-6 min-w-0">
            <SurfaceCard>
              <div className="flex items-start sm:items-center gap-2">
                <Building2 className="h-5 w-5 text-[#087F8C] shrink-0 mt-0.5 sm:mt-0" />
                <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
                  Publish Verified Bed &amp; Oxygen Capacity Report
                </h2>
              </div>
              <form onSubmit={handlePublishCapacity} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2 text-xs min-w-0">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Facility</span>
                  <select
                    value={capFacId}
                    onChange={(e) => setCapFacId(e.target.value)}
                    className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                  >
                    {facilities.map((f) => (
                      <option key={f.facilityId} value={f.facilityId}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs min-w-0">
                  <span className="font-medium text-slate-600 dark:text-slate-300">ICU Beds Available</span>
                  <input
                    type="number"
                    min={0}
                    value={capIcu}
                    onChange={(e) => setCapIcu(e.target.value)}
                    className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                  />
                </label>
                <label className="text-xs min-w-0">
                  <span className="font-medium text-slate-600 dark:text-slate-300">General Beds Available</span>
                  <input
                    type="number"
                    min={0}
                    value={capGen}
                    onChange={(e) => setCapGen(e.target.value)}
                    className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono tabular-nums"
                  />
                </label>
                <label className="sm:col-span-2 text-xs min-w-0">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Oxygen Status</span>
                  <select
                    value={capO2}
                    onChange={(e) => setCapO2(e.target.value as OxygenStatus)}
                    className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                  >
                    <option value="verified_available">Verified Available</option>
                    <option value="limited">Limited</option>
                    <option value="unavailable">Unavailable</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <div className="sm:col-span-2 flex justify-end pt-1">
                  <Button type="submit" className="w-full sm:w-auto">
                    Publish Capacity Report
                  </Button>
                </div>
              </form>
              {capMessage && <p className="mt-2.5 text-xs text-[#087F8C] dark:text-[#16B8C5]">{capMessage}</p>}
            </SurfaceCard>

            <SurfaceCard>
              <h3 className="text-base font-bold text-[#10243A] dark:text-white">
                Incoming Referrals &amp; Emergency Handover Readiness
              </h3>
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                {referrals.slice(0, 5).map((r) => (
                  <div key={r.referralId} className="py-3.5 text-xs space-y-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong className="text-sm text-[#10243A] dark:text-white">{r.destinationFacilityName}</strong>
                      <span className="font-mono text-[#087F8C] dark:text-[#16B8C5] font-semibold">{r.status}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{r.reason}</p>
                    {(r.status === 'submitted' || r.status === 'arrived') && (
                      <div className="flex flex-wrap gap-2 pt-0.5">
                        {r.status === 'submitted' && (
                          <Button
                            size="sm"
                            onClick={() =>
                              void transitionReferralStatus({
                                referral: r,
                                toStatus: 'accepted',
                                actorUid: user.uid,
                                actorRole: activeRole,
                                note: 'Bed & receiving doctor confirmed',
                              })
                            }
                          >
                            Accept Transfer
                          </Button>
                        )}
                        {r.status === 'arrived' && (
                          <Button
                            size="sm"
                            onClick={() =>
                              void transitionReferralStatus({
                                referral: r,
                                toStatus: 'handed_over',
                                actorUid: user.uid,
                                actorRole: activeRole,
                                note: 'Patient received at emergency desk',
                              })
                            }
                          >
                            Confirm Handover
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {emergencies
                  .filter((e) => e.status === 'en_route_to_hospital' || e.status === 'hospital_acknowledged')
                  .map((em) => (
                    <div
                      key={em.emergencyId}
                      className="my-2 rounded-xl border border-[#087F8C] bg-[#087F8C]/5 p-3.5 text-xs space-y-2.5"
                    >
                      <div className="font-bold text-sm text-[#10243A] dark:text-white">
                        Incoming Ambulance ({em.assignedAmbulanceId}) · {em.status}
                      </div>
                      <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px] sm:min-h-[32px]">
                        <input
                          type="checkbox"
                          checked={Boolean(readinessChecks[em.emergencyId])}
                          onChange={(e) =>
                            setReadinessChecks((prev) => ({ ...prev, [em.emergencyId]: e.target.checked }))
                          }
                          className="h-5 w-5 sm:h-4 sm:w-4 accent-[#087F8C] shrink-0"
                        />
                        <span>Trauma / Oxygen bay &amp; receiving clinician prepared</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {em.status === 'en_route_to_hospital' && (
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              void transitionEmergencyStatus({
                                emergency: em,
                                toStatus: 'hospital_acknowledged',
                                actorUid: user.uid,
                                actorRole: activeRole,
                                note: 'Receiving hospital acknowledged incoming patient',
                              })
                            }
                          >
                            Acknowledge Arrival Prep
                          </Button>
                        )}
                        {em.status === 'hospital_acknowledged' && (
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              void transitionEmergencyStatus({
                                emergency: em,
                                toStatus: 'handed_over',
                                actorUid: user.uid,
                                actorRole: activeRole,
                                note: 'Hospital handover completed',
                              })
                            }
                          >
                            Complete Handover
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </SurfaceCard>
          </div>

          <div className="lg:col-span-5 min-w-0">
            {!lowDataMode && (
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {!hospitalImgFailed ? (
                  <img
                    src="/src/assets/images/raksha_hospital_coord_1795065611280.jpg"
                    alt="District hospital emergency coordination desk"
                    referrerPolicy="no-referrer"
                    onError={() => setHospitalImgFailed(true)}
                    className="w-full h-56 object-cover"
                  />
                ) : (
                  <div className="w-full h-44 bg-gradient-to-br from-[#10243A] to-[#087F8C] p-5 flex flex-col justify-end text-white">
                    <Building2 className="h-7 w-7 text-[#16B8C5] mb-2" />
                    <div className="text-sm font-semibold">District Emergency Receiving Desk</div>
                  </div>
                )}
                <div className="p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Receiving Hospital Desk Checklist:</strong> Verify oxygen manifold pressure, assign emergency bay, and mark handover upon patient arrival.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISPATCHER PORTAL */}
      {activePortalTab === 'dispatcher' && (
        <div className="space-y-6">
          {tenantId === 'mh-live' ? (
            <SurfaceCard className="border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-amber-950 dark:text-amber-100 max-w-2xl leading-relaxed">
                  <strong>Live Fleet Dispatch Disabled (mh-live):</strong> Connect an authorized EMS provider to dispatch real vehicles. Switch to the isolated Demo Sandbox to test explainable ambulance scoring and dispatch acceptance.
                </p>
                <Button variant="secondary" size="sm" className="w-full sm:w-auto shrink-0" onClick={onSwitchToDemo}>
                  Switch to Demo Sandbox
                </Button>
              </div>
            </SurfaceCard>
          ) : (
            <div className="space-y-4">
              {emergencies.length === 0 ? (
                <EmptyState
                  title="No emergency queue items in Demo Sandbox"
                  description="Open the Emergency screen to create a demo emergency request, then propose an ambulance here."
                />
              ) : (
                emergencies.map((em) => {
                  const rankedAmbs = rankAmbulances(ambulances, { lat: em.lat, lng: em.lng });
                  return (
                    <SurfaceCard key={em.emergencyId}>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-slate-500 break-words">
                            {em.emergencyId} · Status: <strong>{em.status}</strong>
                          </div>
                          <h3 className="mt-1 text-base font-bold text-[#10243A] dark:text-white break-words">
                            {em.patientDisplayName} · {em.villageOrLandmark}
                          </h3>
                          {em.symptoms && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                              {em.symptoms}
                            </p>
                          )}
                        </div>
                        {(em.status === 'pending_validation' ||
                          em.status === 'acknowledged' ||
                          em.status === 'driver_rejected') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto shrink-0"
                            onClick={() =>
                              void transitionEmergencyStatus({
                                emergency: em,
                                toStatus: 'no_ambulance_available',
                                actorUid: user.uid,
                                actorRole: activeRole,
                                cancelOrFailReason: 'All regional fleet units currently occupied; advised 108/112 escalation.',
                              })
                            }
                          >
                            Mark No Ambulance Available
                          </Button>
                        )}
                      </div>

                      {['pending_validation', 'acknowledged', 'driver_rejected'].includes(em.status) && (
                        <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Explainable Ambulance Candidate Scoring:
                          </div>
                          <div className="grid gap-3 md:grid-cols-3 auto-rows-fr">
                            {rankedAmbs.map((cand) => (
                              <div
                                key={cand.ambulance.ambulanceId}
                                className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-3"
                              >
                                <div className="space-y-1">
                                  <div className="font-bold text-[#10243A] dark:text-white">
                                    {cand.ambulance.vehicleNumber} ({cand.ambulance.capability})
                                  </div>
                                  <div className="text-slate-500 leading-relaxed">
                                    Score <span className="font-mono tabular-nums">{cand.score}</span> ·{' '}
                                    {cand.reasons.join(' · ')}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  className="w-full"
                                  disabled={!cand.eligible}
                                  onClick={() => void handleProposeAmbulance(em, cand.ambulance)}
                                >
                                  {cand.eligible ? 'Propose Dispatch' : `Unavailable (${cand.ambulance.status})`}
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </SurfaceCard>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* AMBULANCE DRIVER PORTAL */}
      {activePortalTab === 'driver' && (
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 space-y-4 min-w-0">
            <SurfaceCard>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-[#087F8C] shrink-0" />
                  <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
                    Driver Mobile Dispatch Controls
                  </h2>
                </div>
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer min-h-[44px] sm:min-h-[32px]">
                  <input
                    type="checkbox"
                    checked={driverGpsConsent}
                    onChange={(e) => setDriverGpsConsent(e.target.checked)}
                    className="h-5 w-5 sm:h-4 sm:w-4 accent-[#087F8C] shrink-0"
                  />
                  <span>Explicit GPS Location Sharing Consent</span>
                </label>
              </div>
            </SurfaceCard>

            {emergencies
              .filter((e) => e.status !== 'closed' && e.status !== 'cancelled')
              .map((em) => (
                <SurfaceCard key={em.emergencyId} className="space-y-4">
                  <div>
                    <div className="text-xs font-mono text-slate-500 break-words">
                      {em.emergencyId} · Current State: <strong>{em.status}</strong>
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-[#10243A] dark:text-white break-words">
                      Pickup: {em.villageOrLandmark}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                      Callback: {em.callbackNumber} · Destination: {em.destinationFacilityName || 'Assigned District Hub'}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {em.status === 'dispatch_proposed' && (
                      <>
                        <Button
                          size="lg"
                          onClick={() =>
                            void transitionEmergencyStatus({
                              emergency: em,
                              toStatus: 'driver_accepted',
                              actorUid: user.uid,
                              actorRole: activeRole,
                              gpsConsentGranted: driverGpsConsent,
                              driverLat: driverGpsConsent ? 18.255 : undefined,
                              driverLng: driverGpsConsent ? 73.71 : undefined,
                              note: 'Driver confirmed dispatch acceptance',
                            })
                          }
                        >
                          Accept Dispatch
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() =>
                            void transitionEmergencyStatus({
                              emergency: em,
                              toStatus: 'driver_rejected',
                              actorUid: user.uid,
                              actorRole: activeRole,
                              cancelOrFailReason: 'Driver unavailable / mechanical hold',
                            })
                          }
                        >
                          Reject Dispatch
                        </Button>
                      </>
                    )}

                    {em.status === 'driver_accepted' && (
                      <Button
                        size="lg"
                        onClick={() =>
                          void transitionEmergencyStatus({
                            emergency: em,
                            toStatus: 'en_route_to_patient',
                            actorUid: user.uid,
                            actorRole: activeRole,
                            gpsConsentGranted: driverGpsConsent,
                            driverLat: driverGpsConsent ? 18.275 : undefined,
                            driverLng: driverGpsConsent ? 73.675 : undefined,
                          })
                        }
                      >
                        Start Trip to Patient
                      </Button>
                    )}

                    {em.status === 'en_route_to_patient' && (
                      <Button
                        size="lg"
                        onClick={() =>
                          void transitionEmergencyStatus({
                            emergency: em,
                            toStatus: 'arrived_at_pickup',
                            actorUid: user.uid,
                            actorRole: activeRole,
                          })
                        }
                      >
                        Arrived at Pickup
                      </Button>
                    )}

                    {em.status === 'arrived_at_pickup' && (
                      <Button
                        size="lg"
                        onClick={() =>
                          void transitionEmergencyStatus({
                            emergency: em,
                            toStatus: 'patient_onboard',
                            actorUid: user.uid,
                            actorRole: activeRole,
                          })
                        }
                      >
                        Patient Onboard
                      </Button>
                    )}

                    {em.status === 'patient_onboard' && (
                      <Button
                        size="lg"
                        onClick={() =>
                          void transitionEmergencyStatus({
                            emergency: em,
                            toStatus: 'en_route_to_hospital',
                            actorUid: user.uid,
                            actorRole: activeRole,
                          })
                        }
                      >
                        En Route to Hospital
                      </Button>
                    )}

                    {['en_route_to_hospital', 'hospital_acknowledged'].includes(em.status) && (
                      <Button
                        size="lg"
                        onClick={() =>
                          void transitionEmergencyStatus({
                            emergency: em,
                            toStatus: 'arrived_at_hospital',
                            actorUid: user.uid,
                            actorRole: activeRole,
                          })
                        }
                      >
                        Arrived at Hospital
                      </Button>
                    )}

                    {em.status === 'handed_over' && (
                      <Button
                        size="lg"
                        onClick={() =>
                          void transitionEmergencyStatus({
                            emergency: em,
                            toStatus: 'closed',
                            actorUid: user.uid,
                            actorRole: activeRole,
                            note: 'Trip completed and unit cleared',
                          })
                        }
                      >
                        Close Trip
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                    {typeof em.lat === 'number' && typeof em.lng === 'number' && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${em.lat},${em.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] sm:min-h-[32px] shrink-0"
                      >
                        <Navigation className="h-4 w-4 shrink-0" />
                        <span>Open Turn-by-Turn Navigation</span>
                      </a>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:flex-1 sm:max-w-md">
                      <input
                        type="text"
                        value={incidentNote}
                        onChange={(e) => setIncidentNote(e.target.value)}
                        placeholder="Road delay / mechanical incident note"
                        className="min-w-0 flex-1 min-h-[44px] sm:min-h-[38px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm sm:text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto shrink-0"
                        disabled={!incidentNote.trim()}
                        onClick={async () => {
                          await logAuditEvent({
                            tenantId,
                            actorUid: user.uid,
                            actorRole: activeRole,
                            action: 'DRIVER_INCIDENT_REPORTED',
                            resourceType: 'emergency',
                            resourceId: em.emergencyId,
                            reason: incidentNote.trim(),
                          });
                          setIncidentNote('');
                        }}
                      >
                        Log Incident
                      </Button>
                    </div>
                  </div>
                </SurfaceCard>
              ))}
          </div>

          <div className="lg:col-span-5 min-w-0">
            {!lowDataMode && (
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                {!driverImgFailed ? (
                  <img
                    src="/src/assets/images/raksha_ambulance_corridor_1795065611342.jpg"
                    alt="Rural Maharashtra ambulance highway corridor"
                    referrerPolicy="no-referrer"
                    onError={() => setDriverImgFailed(true)}
                    className="w-full h-56 object-cover"
                  />
                ) : (
                  <div className="w-full h-44 bg-gradient-to-br from-[#10243A] to-[#087F8C] p-5 flex flex-col justify-end text-white">
                    <Truck className="h-7 w-7 text-[#16B8C5] mb-2" />
                    <div className="text-sm font-semibold">Emergency Ambulance Field Corridor</div>
                  </div>
                )}
                <div className="p-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Field Safety Protocol:</strong> Confirm GPS sharing consent before starting pickup transit; log road blocks or mechanical failures immediately so dispatcher can reassign.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADMIN & DISTRICT ACCESS-GAP ANALYTICS */}
      {activePortalTab === 'admin' && (
        <div className="space-y-6">
          <SurfaceCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
                  District Access-Gap Analytics (Non-PII Aggregates)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Evaluates emergency travel times and verified facility freshness across rural Maharashtra districts.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto shrink-0"
                onClick={() => void handleGenerateInsight()}
                disabled={aiLoading}
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>{aiLoading ? 'Analyzing...' : 'Generate AI Operational Summary'}</span>
              </Button>
            </div>

            {aiInsight && (
              <div className="mt-4 rounded-xl border border-[#087F8C]/40 bg-[#087F8C]/5 p-4 text-sm text-[#10243A] dark:text-slate-100 leading-relaxed">
                {aiInsight}
              </div>
            )}

            <div className="mt-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[480px] text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">District</th>
                    <th className="py-2.5 px-3 font-medium text-right">Avg Emergency Travel</th>
                    <th className="py-2.5 px-3 font-medium text-right">Verified Capacity Freshness</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Access Gap Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {MAHARASHTRA_ACCESS_GAP_AGGREGATES.map((d) => (
                    <tr key={d.district} className="border-b border-slate-100 dark:border-slate-800/70">
                      <td className="py-2.5 pr-3 font-medium text-[#10243A] dark:text-slate-100">{d.district}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {d.avgTravelMinutesToEmergency} min
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{d.verifiedFreshnessPct}%</td>
                      <td className="py-2.5 pl-3 text-right font-semibold uppercase text-xs">
                        <span
                          className={
                            d.gapSeverity === 'high'
                              ? 'text-[#C81E1E]'
                              : d.gapSeverity === 'moderate'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {d.gapSeverity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>

          {/* Staff Role Governance */}
          <SurfaceCard>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#087F8C] shrink-0" />
              <h2 className="text-base font-bold text-[#10243A] dark:text-white">
                Verified Staff Role Governance (Admin-Only Write)
              </h2>
            </div>
            <form onSubmit={handleGrantRole} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
              <input
                type="text"
                required
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                placeholder="Firebase User UID"
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm font-mono"
              />
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as UserRole)}
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                <option value="frontline_worker">Frontline Worker (ASHA/ANM)</option>
                <option value="hospital_coordinator">Hospital Coordinator</option>
                <option value="clinician">Clinician</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="ambulance_driver">Ambulance Driver</option>
                <option value="auditor">Auditor</option>
              </select>
              <Button type="submit" className="w-full sm:col-span-2 lg:col-span-1">
                Assign Verified Role
              </Button>
            </form>
            {roleMsg && <p className="mt-2.5 text-xs text-[#087F8C] dark:text-[#16B8C5]">{roleMsg}</p>}
          </SurfaceCard>

          {/* Immutable Audit Log Viewer */}
          <SurfaceCard>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#087F8C] shrink-0" />
                <h2 className="text-base font-bold text-[#10243A] dark:text-white">
                  Append-Only Audit Trail ({auditLogs.length} entries)
                </h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full sm:w-auto shrink-0"
                onClick={() => void handleExportAuditCsv()}
              >
                <Download className="h-4 w-4 shrink-0" />
                <span>Export Audit CSV</span>
              </Button>
            </div>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 max-h-80 overflow-y-auto text-xs">
              {auditLogs.length === 0 ? (
                <p className="py-3 text-slate-500">
                  No audit logs visible for your current role in {tenantId}.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.auditId}
                    className="py-3 flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 sm:gap-3"
                  >
                    <div className="min-w-0 break-words">
                      <span className="font-mono font-semibold text-[#10243A] dark:text-white">{log.action}</span> ·{' '}
                      <span>
                        {log.resourceType}/{log.resourceId}
                      </span>
                      {log.reason && <div className="text-slate-500 mt-0.5 leading-relaxed">{log.reason}</div>}
                    </div>
                    <span className="font-mono text-slate-500 shrink-0">{log.actorRole}</span>
                  </div>
                ))
              )}
            </div>
          </SurfaceCard>
        </div>
      )}
    </div>
  );
};
