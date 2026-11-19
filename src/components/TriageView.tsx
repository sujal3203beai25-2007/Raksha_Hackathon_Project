import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Mic,
  MicOff,
  PhoneCall,
  ShieldAlert,
  Volume2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { AudioRecorderHandle, isAudioRecordingSupported, startAudioClipRecording } from '../lib/audioTranscribe.ts';
import { isSpeechRecognitionSupported, speakText, startVoiceRecognition } from '../lib/speech.ts';
import { saveTriageLog } from '../services/firestoreService.ts';
import { t } from '../shared/i18n.ts';
import {
  evaluateTriageRules,
  GENERAL_SYMPTOM_OPTIONS,
  RED_FLAG_OPTIONS,
} from '../shared/triageEngine.ts';
import { FacilityType, TriageResult } from '../shared/types.ts';
import { Button, SurfaceCard } from './ui/Primitives.tsx';

export const TriageView: React.FC<{
  onOpenEmergencyModal: () => void;
  onFindFacilitiesForLevel: (level: FacilityType) => void;
}> = ({ onOpenEmergencyModal, onFindFacilitiesForLevel }) => {
  const { language, user, tenantId } = useApp();
  const copy = t(language);

  const [selectedRedFlags, setSelectedRedFlags] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [ageYears, setAgeYears] = useState<string>('');
  const [pregnant, setPregnant] = useState(false);
  const [uncertainOrSeverePain, setUncertainOrSeverePain] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribingAudio, setTranscribingAudio] = useState(false);
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const audioRecorderRef = useRef<AudioRecorderHandle | null>(null);

  useEffect(() => {
    return () => {
      stopVoiceRef.current?.();
      audioRecorderRef.current?.cancel();
    };
  }, []);

  const [result, setResult] = useState<TriageResult | null>(null);
  const [savedLogId, setSavedLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleFlag = (id: string) => {
    setSelectedRedFlags((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSymptom = (id: string) => {
    setSelectedSymptoms((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleVoiceToggle = async () => {
    if (listening && audioRecorderRef.current) {
      setListening(false);
      setTranscribingAudio(true);
      setVoiceStatus('Transcribing Marathi / Hindi / English audio...');
      try {
        const res = await audioRecorderRef.current.stopAndTranscribe();
        if (res.transcript) {
          setVoiceNote((prev) => (prev ? `${prev} ${res.transcript}` : res.transcript));
          setVoiceStatus(`Audio transcribed (${res.model}).`);
        } else {
          setVoiceStatus('No clear speech detected. Please speak again or type below.');
        }
      } catch (err) {
        setVoiceStatus(err instanceof Error ? err.message : 'Transcription unavailable.');
      } finally {
        audioRecorderRef.current = null;
        setTranscribingAudio(false);
      }
      return;
    }

    if (listening && stopVoiceRef.current) {
      stopVoiceRef.current();
      setListening(false);
      return;
    }

    if (isAudioRecordingSupported()) {
      try {
        const handle = await startAudioClipRecording(language);
        audioRecorderRef.current = handle;
        setListening(true);
        setVoiceStatus('Recording symptom audio... Click again to transcribe.');
        return;
      } catch {
        // Fallback to Web Speech API if MediaRecorder fails
      }
    }

    if (!isSpeechRecognitionSupported()) {
      setVoiceStatus(copy.voiceUnsupported);
      return;
    }
    setVoiceStatus(copy.voiceListening);
    setListening(true);
    stopVoiceRef.current = startVoiceRecognition(
      language,
      (transcript) => {
        setVoiceNote((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setVoiceStatus('Voice note captured.');
      },
      (errReason) => {
        setListening(false);
        if (errReason === 'unsupported') setVoiceStatus(copy.voiceUnsupported);
        else if (errReason === 'permission_denied') setVoiceStatus(copy.voiceDenied);
        else setVoiceStatus('Could not capture audio. Please type your notes.');
      },
      () => {
        setListening(false);
      }
    );
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAge = ageYears.trim() ? Number(ageYears) : undefined;
    const evaluated = evaluateTriageRules({
      redFlags: selectedRedFlags,
      symptoms: selectedSymptoms,
      ageYears: typeof parsedAge === 'number' && !Number.isNaN(parsedAge) ? parsedAge : undefined,
      pregnant,
      uncertainOrSeverePain,
    });
    setResult(evaluated);
    setSavedLogId(null);

    if (user) {
      setSaving(true);
      try {
        const logId = await saveTriageLog(user.uid, tenantId, evaluated);
        setSavedLogId(logId);
      } catch {
        // Non-blocking save; guidance remains displayed immediately
      } finally {
        setSaving(false);
      }
    }
  };

  const labelFor = (item: { en: string; hi: string; mr: string }) =>
    language === 'hi' ? item.hi : language === 'mr' ? item.mr : item.en;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-[#10243A] dark:text-white">{copy.navTriage}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{copy.triageNonDiagnostic}</p>
      </div>

      {/* Immediate Red Flag Emergency Banner */}
      <div className="rounded-2xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className="h-5 w-5 text-[#C81E1E] shrink-0 mt-0.5" />
          <div className="text-sm text-[#10243A] dark:text-red-100 leading-relaxed">
            <strong>Danger Signs Present?</strong> Never wait to complete a form if someone is unconscious, has chest pain, severe bleeding, or cannot breathe.
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href="tel:108"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#C81E1E] px-4 min-h-[44px] text-xs font-semibold text-white hover:bg-[#A61717] whitespace-nowrap"
          >
            <PhoneCall className="h-4 w-4 shrink-0" />
            <span>{copy.call108Now}</span>
          </a>
          <Button variant="outline" size="sm" onClick={onOpenEmergencyModal}>
            Open Emergency Screen
          </Button>
        </div>
      </div>

      <form onSubmit={handleEvaluate} className="space-y-6">
        {/* Step 1: Red Flags */}
        <SurfaceCard>
          <h2 className="text-base font-bold text-[#C81E1E] dark:text-red-300">
            1. Check Immediate Red-Flag Signs (Ruleset triage-v2.1-mh)
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Selecting any red flag escalates immediately to emergency care guidance.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {RED_FLAG_OPTIONS.map((flag) => {
              const checked = selectedRedFlags.includes(flag.id);
              return (
                <label
                  key={flag.id}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 min-h-[56px] cursor-pointer transition-colors min-w-0 ${
                    checked
                      ? 'border-[#C81E1E] bg-red-50/70 dark:bg-red-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFlag(flag.id)}
                    className="mt-0.5 h-5 w-5 accent-[#C81E1E] shrink-0"
                  />
                  <span className="text-sm text-[#10243A] dark:text-slate-100 leading-snug break-words">
                    {labelFor(flag)}
                  </span>
                </label>
              );
            })}
          </div>
        </SurfaceCard>

        {/* Step 2: General Symptoms & Modifiers */}
        <SurfaceCard>
          <h2 className="text-base font-bold text-[#10243A] dark:text-white">
            2. Symptoms &amp; Patient Modifiers
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {GENERAL_SYMPTOM_OPTIONS.map((sym) => {
              const checked = selectedSymptoms.includes(sym.id);
              return (
                <label
                  key={sym.id}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 min-h-[56px] cursor-pointer transition-colors min-w-0 ${
                    checked
                      ? 'border-[#087F8C] bg-[#087F8C]/5 dark:border-[#16B8C5] dark:bg-[#16B8C5]/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSymptom(sym.id)}
                    className="mt-0.5 h-5 w-5 accent-[#087F8C] shrink-0"
                  />
                  <span className="text-sm text-[#10243A] dark:text-slate-100 leading-snug break-words">
                    {labelFor(sym)}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3 sm:items-end pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-sm min-w-0">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Patient Age (Years, optional)
              </span>
              <input
                type="number"
                min={0}
                max={120}
                value={ageYears}
                onChange={(e) => setAgeYears(e.target.value)}
                placeholder="e.g. 68"
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
            </label>

            <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={pregnant}
                onChange={(e) => setPregnant(e.target.checked)}
                className="h-5 w-5 accent-[#087F8C] shrink-0"
              />
              <span>Pregnant or Postpartum</span>
            </label>

            <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={uncertainOrSeverePain}
                onChange={(e) => setUncertainOrSeverePain(e.target.checked)}
                className="h-5 w-5 accent-[#087F8C] shrink-0"
              />
              <span>Uncertain / Needs Nurse Review</span>
            </label>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label htmlFor="triage-notes" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Optional Context / Voice Note (Stored locally unless signed in)
              </label>
              <button
                type="button"
                disabled={transcribingAudio}
                onClick={() => void handleVoiceToggle()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[40px] px-2 cursor-pointer disabled:opacity-50"
              >
                {listening ? <MicOff className="h-4 w-4 text-[#C81E1E]" /> : <Mic className="h-4 w-4" />}
                <span>
                  {transcribingAudio ? 'Transcribing...' : listening ? 'Stop & Transcribe' : copy.voiceStart}
                </span>
              </button>
            </div>
            <textarea
              id="triage-notes"
              rows={2}
              value={voiceNote}
              onChange={(e) => setVoiceNote(e.target.value)}
              placeholder="Optional description for the receiving nurse or ASHA worker..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm"
            />
            {voiceStatus && <p className="mt-1 text-xs text-slate-500">{voiceStatus}</p>}
          </div>
        </SurfaceCard>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Deterministic, versioned clinical navigation logic — zero black-box diagnosis.
          </span>
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            Check Recommended Care Level
          </Button>
        </div>
      </form>

      {/* Evaluation Output */}
      {result && (
        <SurfaceCard
          className={
            result.urgency === 'emergency'
              ? 'border-red-400 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20'
              : 'border-[#087F8C] dark:border-[#16B8C5]'
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-mono text-slate-500">
                Rule Engine: {result.ruleVersion} · Urgency: {result.urgency.toUpperCase()}
              </div>
              <h2 className="mt-1 text-xl font-bold text-[#10243A] dark:text-white leading-snug">
                {result.urgency === 'emergency'
                  ? 'Immediate Emergency Care Recommended'
                  : result.urgency === 'human_review'
                    ? 'Clinician / ASHA Human Review Recommended'
                    : result.urgency === 'urgent'
                      ? 'Same-Day Evaluation Recommended'
                      : 'Primary Health Centre Consultation Suggested'}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => speakText(`${result.rationale} ${result.nonDiagnosticNotice}`, language)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] px-2 cursor-pointer shrink-0"
            >
              <Volume2 className="h-4 w-4" />
              {copy.readAloud}
            </button>
          </div>

          <p className="mt-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{result.rationale}</p>

          <div className="mt-4 flex items-start gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <ShieldAlert className="h-4 w-4 text-[#087F8C] shrink-0 mt-0.5" />
            <span>{result.nonDiagnosticNotice}</span>
          </div>

          {saving && <p className="mt-2 text-xs text-slate-500">Logging triage check...</p>}
          {savedLogId && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Saved to your private triage history ({savedLogId})</span>
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {result.urgency === 'emergency' && (
              <Button variant="emergency" onClick={onOpenEmergencyModal}>
                <PhoneCall className="h-4 w-4 shrink-0" />
                <span>Request Emergency Assistance</span>
              </Button>
            )}
            <Button variant="primary" onClick={() => onFindFacilitiesForLevel(result.recommendedCareLevel)}>
              <span>Find {result.recommendedCareLevel}+ Facilities Nearby</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Button>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
};
