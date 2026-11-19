import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  PhoneCall,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { AudioRecorderHandle, isAudioRecordingSupported, startAudioClipRecording } from '../lib/audioTranscribe.ts';
import { createEmergencyRequest, transitionEmergencyStatus } from '../services/firestoreService.ts';
import { t } from '../shared/i18n.ts';
import { EmergencyRecord, FacilityRecord } from '../shared/types.ts';
import { Button, EmptyState, SurfaceCard } from './ui/Primitives.tsx';

export const EmergencyView: React.FC<{
  emergencies: EmergencyRecord[];
  facilities: FacilityRecord[];
  onSwitchToDemo: () => void;
}> = ({ emergencies, facilities, onSwitchToDemo }) => {
  const { language, user, tenantId, activeRole, signInWithGoogle, broadcastWsEvent } = useApp();
  const copy = t(language);

  const [callbackNumber, setCallbackNumber] = useState('');
  const [villageOrLandmark, setVillageOrLandmark] = useState('Velhe Taluka Bus Stand, Pune Rural');
  const [locationMode, setLocationMode] = useState<'gps' | 'manual'>('manual');
  const [lat, setLat] = useState<number | undefined>(18.2947);
  const [lng, setLng] = useState<number | undefined>(73.6353);
  const [symptoms, setSymptoms] = useState('');
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const voiceRecorderRef = useRef<AudioRecorderHandle | null>(null);

  useEffect(() => {
    return () => {
      voiceRecorderRef.current?.cancel();
    };
  }, []);

  const handleVoiceSituation = async () => {
    if (recordingVoice && voiceRecorderRef.current) {
      setRecordingVoice(false);
      setTranscribingVoice(true);
      try {
        const res = await voiceRecorderRef.current.stopAndTranscribe();
        if (res.transcript) {
          setSymptoms((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript));
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to transcribe audio.');
      } finally {
        voiceRecorderRef.current = null;
        setTranscribingVoice(false);
      }
      return;
    }
    setErrorMsg(null);
    try {
      const handle = await startAudioClipRecording(language);
      voiceRecorderRef.current = handle;
      setRecordingVoice(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone access unavailable.');
    }
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsNotice('GPS unavailable in browser; enter village or landmark manually.');
      return;
    }
    setGpsNotice('Capturing coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationMode('gps');
        setLat(Number(pos.coords.latitude.toFixed(5)));
        setLng(Number(pos.coords.longitude.toFixed(5)));
        setGpsNotice(`GPS captured (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}).`);
      },
      () => {
        setGpsNotice('GPS permission denied. Please enter your village/landmark accurately.');
        setLocationMode('manual');
      },
      { timeout: 6000 }
    );
  };

  const handleRequestEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const id = await createEmergencyRequest({
        tenantId,
        patientUid: user.uid,
        patientDisplayName: user.displayName || 'Citizen Caller',
        callbackNumber: callbackNumber.trim(),
        locationMode,
        villageOrLandmark: villageOrLandmark.trim(),
        lat,
        lng,
        symptoms: symptoms.trim() || undefined,
      });
      broadcastWsEvent('emergency:created', { emergencyId: id, tenantId });
      setSymptoms('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to log request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEmergency = async (emg: EmergencyRecord) => {
    if (!user) return;
    try {
      await transitionEmergencyStatus({
        emergency: emg,
        toStatus: 'cancelled',
        actorUid: user.uid,
        actorRole: activeRole,
        cancelOrFailReason: 'Cancelled by patient / caller',
      });
      broadcastWsEvent('emergency:updated', { emergencyId: emg.emergencyId, status: 'cancelled' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not cancel request.');
    }
  };

  const activeEmergency = emergencies.find((e) => e.status !== 'closed' && e.status !== 'cancelled');
  const assignedReady =
    activeEmergency &&
    activeEmergency.assignedAmbulanceId &&
    [
      'driver_accepted',
      'en_route_to_patient',
      'arrived_at_pickup',
      'patient_onboard',
      'en_route_to_hospital',
      'hospital_acknowledged',
      'arrived_at_hospital',
      'handed_over',
    ].includes(activeEmergency.status);

  const destFacility = activeEmergency?.destinationFacilityId
    ? facilities.find((f) => f.facilityId === activeEmergency.destinationFacilityId)
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Always-Visible Direct 108 / 112 Fallback */}
      <div className="rounded-2xl border-2 border-[#C81E1E] bg-red-50 dark:bg-red-950/40 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl min-w-0">
            <div className="flex items-start sm:items-center gap-2 text-[#C81E1E] dark:text-red-300 font-bold text-base">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 sm:mt-0" />
              <span>Direct Emergency Fallback — 108 / 112 Always Comes First</span>
            </div>
            <p className="text-sm text-[#10243A] dark:text-red-100 leading-relaxed">
              RAKSHA does not replace public emergency dispatch. For life-threatening emergencies in Maharashtra, call{' '}
              <strong>108</strong> (EMS Ambulance) or <strong>112</strong> (National Emergency) directly right now.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-2.5 shrink-0">
            <a
              href="tel:108"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C81E1E] px-4 sm:px-5 min-h-[48px] text-sm font-bold text-white hover:bg-[#A61717] transition-colors whitespace-nowrap"
            >
              <PhoneCall className="h-4 w-4 shrink-0" />
              <span>{copy.call108Now}</span>
            </a>
            <a
              href="tel:112"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#C81E1E] bg-white dark:bg-slate-900 px-4 sm:px-5 min-h-[48px] text-sm font-bold text-[#C81E1E] dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors whitespace-nowrap"
            >
              <PhoneCall className="h-4 w-4 shrink-0" />
              <span>{copy.call112Now}</span>
            </a>
          </div>
        </div>
      </div>

      {/* Live Pilot Gate vs Demo Sandbox Notice */}
      {tenantId === 'mh-live' ? (
        <SurfaceCard className="border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 max-w-2xl min-w-0">
              <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-950 dark:text-amber-100 leading-relaxed">
                <strong>Live Ambulance Dispatch Disabled (mh-live):</strong> Verified real-world EMS partner credentials are not connected in this pilot environment. Requests logged here remain in <code>pending_validation</code>, or you can test the complete multi-role dispatch workflow inside the isolated Demo Sandbox.
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={onSwitchToDemo} className="self-start sm:self-center">
              Open Isolated Demo Sandbox
            </Button>
          </div>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="text-sm text-emerald-950 dark:text-emerald-100 leading-relaxed">
            <strong>Isolated Demo Sandbox (demo-maharashtra):</strong> Simulated ambulance dispatch, driver GPS acceptance, and hospital acknowledgement are enabled for end-to-end verification.
          </div>
        </SurfaceCard>
      )}

      {/* Active Emergency Status Tracker */}
      {activeEmergency && (
        <SurfaceCard className="border-[#087F8C] dark:border-[#16B8C5]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-mono text-slate-500 break-all">
                Case ID: {activeEmergency.emergencyId} · Version {activeEmergency.version}
              </div>
              <h2 className="mt-1 text-xl font-bold text-[#10243A] dark:text-white leading-snug">
                Status: {activeEmergency.status.replace(/_/g, ' ').toUpperCase()}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Location: {activeEmergency.villageOrLandmark} · Callback: {activeEmergency.callbackNumber}
              </p>
            </div>
            {['pending_validation', 'acknowledged', 'dispatch_proposed', 'driver_accepted', 'en_route_to_patient', 'arrived_at_pickup'].includes(
              activeEmergency.status
            ) && (
              <Button variant="outline" size="sm" onClick={() => void handleCancelEmergency(activeEmergency)}>
                Cancel Request
              </Button>
            )}
          </div>

          {assignedReady ? (
            <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800/60 space-y-3 text-sm">
              <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                <Truck className="h-5 w-5 shrink-0" />
                <span>Confirmed Ambulance Assigned: {activeEmergency.assignedAmbulanceId}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 text-xs text-slate-700 dark:text-slate-200">
                <div>
                  <strong>Destination:</strong>{' '}
                  {activeEmergency.destinationFacilityName || destFacility?.name || 'Pending Hospital Assignment'}
                </div>
                <div>
                  <strong>Verified ETA:</strong>{' '}
                  {typeof activeEmergency.etaMinutes === 'number'
                    ? `~${activeEmergency.etaMinutes} min (est.)`
                    : 'Not yet reported'}
                </div>
                <div>
                  <strong>Driver Live GPS:</strong>{' '}
                  {activeEmergency.gpsConsentGranted && typeof activeEmergency.driverLat === 'number'
                    ? `${activeEmergency.driverLat.toFixed(4)}, ${activeEmergency.driverLng?.toFixed(4)}`
                    : 'GPS consent inactive / unavailable'}
                </div>
              </div>
              {activeEmergency.gpsConsentGranted &&
                typeof activeEmergency.driverLat === 'number' &&
                typeof activeEmergency.lat === 'number' && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${activeEmergency.driverLat},${activeEmergency.driverLng}&destination=${activeEmergency.lat},${activeEmergency.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[36px]"
                  >
                    <Navigation className="h-3.5 w-3.5 shrink-0" />
                    <span>Open Route Corridor in Google Maps</span>
                  </a>
                )}
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2 leading-relaxed">
              <Clock className="h-4 w-4 text-[#087F8C] shrink-0 mt-0.5" />
              <span>
                {activeEmergency.status === 'dispatch_proposed'
                  ? 'A unit has been proposed by dispatcher. Ambulance details and live ETA appear only after the driver explicitly confirms acceptance.'
                  : activeEmergency.status === 'no_ambulance_available'
                    ? `No ambulance unit available: ${activeEmergency.cancelOrFailReason || 'Please dial 108 / 112 immediately.'}`
                    : 'Waiting for dispatcher acknowledgement and confirmed driver acceptance.'}
              </span>
            </div>
          )}
        </SurfaceCard>
      )}

      {/* Create Emergency Request Form */}
      <SurfaceCard>
        <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
          Request Coordination Assistance
        </h2>
        {!user ? (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Sign in with Google to submit and track an authenticated emergency request, or dial <strong>108 / 112</strong> immediately without signing in.
            </p>
            <Button onClick={() => void signInWithGoogle()} className="self-start sm:self-center">
              {copy.signInGoogle}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleRequestEmergency} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm min-w-0">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Callback Phone Number (required)
                </span>
                <input
                  type="tel"
                  required
                  minLength={6}
                  maxLength={20}
                  value={callbackNumber}
                  onChange={(e) => setCallbackNumber(e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>

              <div className="min-w-0">
                <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Location Capture (GPS or Manual Village/Landmark)
                </span>
                <div className="flex gap-2 min-w-0">
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={villageOrLandmark}
                    onChange={(e) => setVillageOrLandmark(e.target.value)}
                    placeholder="Village, taluka, or nearest landmark"
                    className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                  />
                  <Button type="button" variant="outline" onClick={handleCaptureGps} className="shrink-0">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>GPS</span>
                  </Button>
                </div>
              </div>
            </div>

            {gpsNotice && <p className="text-xs text-[#087F8C] dark:text-[#16B8C5]">{gpsNotice}</p>}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label htmlFor="emergency-symptoms" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Brief Situation / Symptoms (optional)
                </label>
                {isAudioRecordingSupported() && (
                  <button
                    type="button"
                    disabled={transcribingVoice}
                    onClick={() => void handleVoiceSituation()}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[36px] px-2 cursor-pointer disabled:opacity-50"
                  >
                    {recordingVoice ? <MicOff className="h-3.5 w-3.5 text-[#C81E1E]" /> : <Mic className="h-3.5 w-3.5" />}
                    <span>
                      {transcribingVoice
                        ? 'Transcribing...'
                        : recordingVoice
                          ? 'Stop & Transcribe'
                          : copy.voiceStart}
                    </span>
                  </button>
                )}
              </div>
              <textarea
                id="emergency-symptoms"
                rows={2}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g. Chest discomfort / obstetric emergency / road injury near highway junction"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm"
              />
            </div>

            {errorMsg && <p className="text-xs text-[#C81E1E]">{errorMsg}</p>}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Environment: <strong>{tenantId}</strong>
              </span>
              <Button type="submit" variant="emergency" size="lg" disabled={submitting} className="w-full sm:w-auto">
                <PhoneCall className="h-4 w-4 shrink-0" />
                <span>{submitting ? 'Sending...' : 'Log Emergency Assistance Request'}</span>
              </Button>
            </div>
          </form>
        )}
      </SurfaceCard>

      {/* Past / Recent Emergency History */}
      <SurfaceCard>
        <h3 className="text-base font-bold text-[#10243A] dark:text-white">Recent Emergency Requests ({tenantId})</h3>
        {emergencies.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No emergency requests logged"
              description="Active or historical requests for this environment will appear here."
            />
          </div>
        ) : (
          <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
            {emergencies.map((em) => (
              <div
                key={em.emergencyId}
                className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-[#10243A] dark:text-slate-100">
                    {em.emergencyId}
                  </span>{' '}
                  · <span>{em.villageOrLandmark}</span>
                  {em.symptoms && <div className="mt-0.5 text-slate-500">{em.symptoms}</div>}
                </div>
                <div className="inline-flex items-center gap-1.5 font-semibold text-[#087F8C] dark:text-[#16B8C5] shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{em.status.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
};
