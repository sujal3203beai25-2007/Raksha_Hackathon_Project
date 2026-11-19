import { CheckCircle2, FileCode2, History, QrCode, Sparkles, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import {
  attachReferralAiSummary,
  createReferralRecord,
  fetchReferralEvents,
  transitionReferralStatus,
} from '../services/firestoreService.ts';
import { t } from '../shared/i18n.ts';
import { REFERRAL_TRANSITIONS } from '../shared/referralFsm.ts';
import {
  ConsentRecord,
  FacilityRecord,
  ReferralEventRecord,
  ReferralRecord,
  ReferralStatus,
  ReferralUrgency,
} from '../shared/types.ts';
import { Button, EmptyState, ModalDialog, SkeletonRows, SurfaceCard } from './ui/Primitives.tsx';

export const ReferralsView: React.FC<{
  referrals: ReferralRecord[];
  facilities: FacilityRecord[];
  consents: ConsentRecord[];
  loading: boolean;
  preselectedDestination?: FacilityRecord | null;
}> = ({ referrals, facilities, consents, loading, preselectedDestination }) => {
  const { language, user, tenantId, activeRole, signInWithGoogle, getAuthHeader, broadcastWsEvent } = useApp();
  const copy = t(language);

  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState(preselectedDestination?.facilityId || '');
  const [urgency, setUrgency] = useState<ReferralUrgency>('urgent');
  const [reason, setReason] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [submitMode, setSubmitMode] = useState<'submitted' | 'draft'>('submitted');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inspection / QR / Events / FHIR modals
  const [eventsModalRef, setEventsModalRef] = useState<ReferralRecord | null>(null);
  const [eventsList, setEventsList] = useState<ReferralEventRecord[]>([]);
  const [qrModalRef, setQrModalRef] = useState<ReferralRecord | null>(null);
  const [fhirJson, setFhirJson] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedDestination) {
      setDestId(preselectedDestination.facilityId);
    }
  }, [preselectedDestination]);

  useEffect(() => {
    if (!originId && facilities.length > 0) setOriginId(facilities[0].facilityId);
    if (!destId && facilities.length > 1) setDestId(facilities[1].facilityId);
  }, [facilities, originId, destId]);

  const aiConsentGranted = consents.some((c) => c.purpose === 'ai_summarization' && c.granted);
  const referralConsent = consents.find((c) => c.purpose === 'referral_sharing' && c.granted);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const originFac = facilities.find((f) => f.facilityId === originId) ?? facilities[0];
    const destFac = facilities.find((f) => f.facilityId === destId) ?? facilities[facilities.length - 1];
    if (!originFac || !destFac) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const id = await createReferralRecord({
        tenantId,
        patientUid: user.uid,
        patientDisplayName: user.displayName || 'Citizen Patient',
        createdByUid: user.uid,
        actorRole: activeRole,
        originFacilityId: originFac.facilityId,
        originFacilityName: originFac.name,
        destinationFacilityId: destFac.facilityId,
        destinationFacilityName: destFac.name,
        urgency,
        reason: reason.trim(),
        clinicalSummary: clinicalSummary.trim(),
        initialStatus: submitMode,
        consentId: referralConsent?.consentId,
      });
      broadcastWsEvent('referral:created', { referralId: id, tenantId });
      setReason('');
      setClinicalSummary('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create referral.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransition = async (refItem: ReferralRecord, toStatus: ReferralStatus) => {
    if (!user) return;
    setErrorMsg(null);
    try {
      await transitionReferralStatus({
        referral: refItem,
        toStatus,
        actorUid: user.uid,
        actorRole: activeRole,
      });
      broadcastWsEvent('referral:transitioned', { referralId: refItem.referralId, toStatus });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transition blocked.');
    }
  };

  const handleOpenEvents = async (refItem: ReferralRecord) => {
    setEventsModalRef(refItem);
    setEventsList([]);
    try {
      const list = await fetchReferralEvents(refItem.referralId);
      setEventsList(list);
    } catch {
      setEventsList([]);
    }
  };

  const handleAiSummarize = async (refItem: ReferralRecord) => {
    if (!user) return;
    if (!aiConsentGranted) {
      setErrorMsg('Enable "AI Summarization" consent under Health Records -> DPDP Consents before calling AI.');
      return;
    }
    setAiBusyId(refItem.referralId);
    setErrorMsg(null);
    try {
      const originFac = facilities.find((f) => f.facilityId === refItem.originFacilityId);
      const destFac = facilities.find((f) => f.facilityId === refItem.destinationFacilityId);
      const headers = await getAuthHeader();
      const res = await fetch('/api/ai/summarize-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          reason: refItem.reason,
          clinicalSummary: refItem.clinicalSummary,
          urgency: refItem.urgency,
          originFacilityType: originFac?.type || 'PHC',
          destinationFacilityType: destFac?.type || 'DH',
          language,
          consentGranted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI summarization failed');
      const formatted = [
        data.handoverHeadline,
        Array.isArray(data.keyPoints) ? data.keyPoints.join(' · ') : '',
        data.receivingPrepFocus ? `Prep focus: ${data.receivingPrepFocus}` : '',
      ]
        .filter(Boolean)
        .join(' — ');
      await attachReferralAiSummary(refItem.referralId, formatted, user.uid, refItem.tenantId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI summary error');
    } finally {
      setAiBusyId(null);
    }
  };

  const handlePreviewFhir = async (refItem: ReferralRecord) => {
    if (!user) return;
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/fhir/ServiceRequest/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          referralId: refItem.referralId,
          status: refItem.status,
          urgency: refItem.urgency,
          originFacilityName: refItem.originFacilityName,
          destinationFacilityName: refItem.destinationFacilityName,
          reason: refItem.reason,
        }),
      });
      const data = await res.json();
      setFhirJson(JSON.stringify(data, null, 2));
    } catch {
      setFhirJson('Unable to generate FHIR R4 ServiceRequest preview.');
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <SurfaceCard className="text-center space-y-4">
          <h1 className="text-xl font-bold text-[#10243A] dark:text-white">{copy.actionMyReferrals}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
            Sign in with your Google account to create, approve, and track clinical referrals with immutable audit history and QR transfer passes.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => void signInWithGoogle()}>{copy.signInGoogle}</Button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-[#10243A] dark:text-white tracking-tight">{copy.actionMyReferrals}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
          State-machine enforced inter-facility referrals with optimistic versioning, short-lived QR passes, and immutable transition events.
        </p>
      </div>

      {/* Create Referral Form */}
      <SurfaceCard>
        <h2 className="text-base font-bold text-[#10243A] dark:text-white">Create New Referral</h2>
        <form onSubmit={handleCreate} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm min-w-0">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Origin Facility</span>
              <select
                value={originId}
                onChange={(e) => setOriginId(e.target.value)}
                className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                {facilities.map((f) => (
                  <option key={f.facilityId} value={f.facilityId}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm min-w-0">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Destination Facility</span>
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                {facilities.map((f) => (
                  <option key={f.facilityId} value={f.facilityId}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm min-w-0 sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Urgency</span>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as ReferralUrgency)}
                className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                <option value="emergency">Emergency (15m SLA)</option>
                <option value="urgent">Urgent (60m SLA)</option>
                <option value="routine">Routine (4h SLA)</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm min-w-0">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Referral Reason (required)</span>
              <input
                type="text"
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Suspected preeclampsia requiring OB-GYN & NICU evaluation"
                className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
            </label>

            <label className="block text-sm min-w-0">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Clinical Stabilization &amp; Vitals Summary (required)
              </span>
              <input
                type="text"
                required
                minLength={3}
                value={clinicalSummary}
                onChange={(e) => setClinicalSummary(e.target.value)}
                placeholder="e.g. BP 160/104, IV access secured, MgSO4 loading dose noted"
                className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
            </label>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] sm:min-h-[36px]">
                <input
                  type="radio"
                  name="refMode"
                  checked={submitMode === 'submitted'}
                  onChange={() => setSubmitMode('submitted')}
                  className="h-4 w-4 accent-[#087F8C]"
                />
                <span>Submit Immediately</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer min-h-[44px] sm:min-h-[36px]">
                <input
                  type="radio"
                  name="refMode"
                  checked={submitMode === 'draft'}
                  onChange={() => setSubmitMode('draft')}
                  className="h-4 w-4 accent-[#087F8C]"
                />
                <span>Save as Draft</span>
              </label>
            </div>
            <Button type="submit" className="w-full sm:w-auto" disabled={submitting || facilities.length === 0}>
              {submitting ? 'Creating...' : 'Create Referral'}
            </Button>
          </div>
        </form>
        {errorMsg && <p className="mt-3 text-xs text-[#C81E1E]">{errorMsg}</p>}
      </SurfaceCard>

      {/* Referral List */}
      {loading ? (
        <SkeletonRows rows={3} />
      ) : referrals.length === 0 ? (
        <EmptyState
          title="No referrals in this environment"
          description="Create a referral above or switch to the isolated Demo Sandbox to evaluate end-to-end hospital acceptance."
        />
      ) : (
        <div className="space-y-4">
          {referrals.map((refItem) => {
            const allowedNext = REFERRAL_TRANSITIONS[refItem.status] || [];
            const canStaffAdvance =
              tenantId === 'demo-maharashtra' ||
              activeRole !== 'patient';

            return (
              <SurfaceCard key={refItem.referralId}>
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-mono tabular-nums text-slate-500 break-words">
                      {refItem.referralId} · v{refItem.version} · {refItem.urgency.toUpperCase()} · Status:{' '}
                      <strong className="text-[#087F8C] dark:text-[#16B8C5]">
                        {refItem.status.replace(/_/g, ' ').toUpperCase()}
                      </strong>
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-[#10243A] dark:text-white break-words">
                      {refItem.originFacilityName} → {refItem.destinationFacilityName}
                    </h3>
                    <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      <strong>Reason:</strong> {refItem.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <strong>Summary:</strong> {refItem.clinicalSummary}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 shrink-0">
                    {refItem.qrToken && (
                      <Button variant="outline" size="sm" onClick={() => setQrModalRef(refItem)}>
                        <QrCode className="h-3.5 w-3.5 shrink-0" />
                        <span>QR Pass</span>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => void handleOpenEvents(refItem)}>
                      <History className="h-3.5 w-3.5 shrink-0" />
                      <span>Audit Trail</span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handlePreviewFhir(refItem)}>
                      <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                      <span>FHIR R4</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={aiBusyId === refItem.referralId}
                      onClick={() => void handleAiSummarize(refItem)}
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>{aiBusyId === refItem.referralId ? 'Drafting...' : 'AI Handover Note'}</span>
                    </Button>
                  </div>
                </div>

                {refItem.aiSummaryText && (
                  <div className="mt-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 text-xs space-y-1">
                    <div className="font-semibold text-amber-900 dark:text-amber-200">
                      AI Handover Summary (Pending Clinician Review)
                    </div>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{refItem.aiSummaryText}</p>
                  </div>
                )}

                {allowedNext.length > 0 && (
                  <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 mr-1">FSM Transitions:</span>
                    {allowedNext.map((nextSt) => {
                      const isOwnerOnlyAllowed = nextSt === 'submitted' || nextSt === 'cancelled';
                      if (!canStaffAdvance && !isOwnerOnlyAllowed) return null;
                      return (
                        <Button
                          key={nextSt}
                          size="sm"
                          variant={nextSt === 'cancelled' || nextSt === 'rejected' ? 'outline' : 'secondary'}
                          onClick={() => void handleTransition(refItem, nextSt)}
                        >
                          {nextSt === 'cancelled' || nextSt === 'rejected' ? (
                            <XCircle className="h-3.5 w-3.5 text-[#C81E1E] shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="capitalize">{nextSt.replace(/_/g, ' ')}</span>
                        </Button>
                      );
                    })}
                  </div>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}

      {/* QR Pass Modal */}
      <ModalDialog
        open={Boolean(qrModalRef)}
        onOpenChange={(open) => !open && setQrModalRef(null)}
        title="Short-Lived Referral QR Retrieval Pass"
        description="Present this pass at the receiving hospital desk. Expires automatically after 2 hours."
      >
        {qrModalRef && (
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="rounded-2xl bg-white p-4 border border-slate-200">
              <QRCodeSVG
                value={JSON.stringify({
                  referralId: qrModalRef.referralId,
                  token: qrModalRef.qrToken,
                  expiresAt: qrModalRef.qrExpiresAt,
                })}
                size={180}
              />
            </div>
            <div className="text-xs font-mono text-slate-600 dark:text-slate-300 space-y-1 break-all">
              <div>Token: {qrModalRef.qrToken}</div>
              <div>
                Expires: {qrModalRef.qrExpiresAt ? new Date(qrModalRef.qrExpiresAt).toLocaleString() : '2h'}
              </div>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Immutable Audit Events Modal */}
      <ModalDialog
        open={Boolean(eventsModalRef)}
        onOpenChange={(open) => !open && setEventsModalRef(null)}
        title={`Immutable Referral Event Trail (${eventsModalRef?.referralId || ''})`}
      >
        <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs max-h-[60vh] overflow-y-auto">
          {eventsList.length === 0 ? (
            <p className="py-3 text-slate-500">Loading immutable transition history...</p>
          ) : (
            eventsList.map((ev) => (
              <div
                key={ev.eventId}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 sm:gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#10243A] dark:text-white">
                    {ev.fromStatus} → {ev.toStatus}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{ev.note}</div>
                </div>
                <span className="font-mono text-slate-500 shrink-0">{ev.actorRole}</span>
              </div>
            ))
          )}
        </div>
      </ModalDialog>

      {/* FHIR R4 Preview Modal */}
      <ModalDialog
        open={Boolean(fhirJson)}
        onOpenChange={(open) => !open && setFhirJson(null)}
        title="FHIR R4 ServiceRequest Structural Preview"
        description="Structural interop adapter only — explicitly NOT ABDM / NHCX certified."
      >
        <pre className="rounded-xl bg-slate-950 text-slate-100 p-4 text-xs max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-mono">
          {fhirJson}
        </pre>
      </ModalDialog>
    </div>
  );
};
