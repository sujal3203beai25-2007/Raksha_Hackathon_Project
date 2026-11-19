import {
  Activity,
  ArrowRight,
  Box,
  CalendarClock,
  FileCheck2,
  FolderHeart,
  MapPin,
  MessageSquare,
  PhoneCall,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
} from 'lucide-react';
import React, { useState } from 'react';
import { AppSection, useApp } from '../context/AppContext.tsx';
import { speakText } from '../lib/speech.ts';
import { t } from '../shared/i18n.ts';
import { MAHARASHTRA_ACCESS_GAP_AGGREGATES } from '../shared/seedData.ts';
import { Button, SurfaceCard } from './ui/Primitives.tsx';

export const LandingView: React.FC<{ onOpenEmergencyModal: () => void }> = ({
  onOpenEmergencyModal,
}) => {
  const { language, setActiveSection, setActivePortalTab, lowDataMode } = useApp();
  const copy = t(language);

  const [faqQuery, setFaqQuery] = useState('');
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqError, setFaqError] = useState<string | null>(null);
  const [faqResponse, setFaqResponse] = useState<{
    answer: string;
    emergencyReminder: string;
    suggestedAction: string;
  } | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const primaryActions: Array<{
    id: AppSection;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
    isEmergency?: boolean;
  }> = [
    {
      id: 'emergency',
      title: copy.actionEmergency,
      desc: copy.actionEmergencyDesc,
      icon: PhoneCall,
      isEmergency: true,
    },
    {
      id: 'find_care',
      title: copy.actionFindCare,
      desc: copy.actionFindCareDesc,
      icon: MapPin,
    },
    {
      id: 'referrals',
      title: copy.actionMyReferrals,
      desc: copy.actionMyReferralsDesc,
      icon: FileCheck2,
    },
    {
      id: 'records',
      title: copy.actionHealthRecords,
      desc: copy.actionHealthRecordsDesc,
      icon: FolderHeart,
    },
    {
      id: 'follow_ups',
      title: copy.actionFollowUps,
      desc: copy.actionFollowUpsDesc,
      icon: CalendarClock,
    },
    {
      id: 'family',
      title: copy.actionFamilyCare,
      desc: copy.actionFamilyCareDesc,
      icon: Users,
    },
  ];

  const handleFaqSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuery.trim()) return;
    setFaqLoading(true);
    setFaqError(null);
    try {
      const res = await fetch('/api/ai/faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: faqQuery.trim(), language }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI navigation assistant unavailable');
      }
      setFaqResponse(data);
    } catch (err) {
      setFaqError(err instanceof Error ? err.message : 'Unable to reach navigation assistant.');
    } finally {
      setFaqLoading(false);
    }
  };

  return (
    <div className="space-y-10 sm:space-y-12 pb-6">
      {/* Hero Section */}
      <section className="grid gap-6 lg:gap-8 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-center min-w-0">
          <p className="text-xs sm:text-sm font-medium text-[#087F8C] dark:text-[#16B8C5] leading-snug">
            Maharashtra Public Healthcare Coordination · Access · Referral · Emergency · Continuity
          </p>

          <h1
            className="mt-2.5 font-display font-bold tracking-tight text-[#10243A] dark:text-white text-[1.625rem] sm:text-[2.125rem] lg:text-[2.625rem] xl:text-[3rem] leading-[1.16] break-words"
            style={{ textWrap: 'balance' }}
          >
            {copy.heroTitle}
          </h1>

          <p className="mt-3.5 text-sm sm:text-base lg:text-[1.0625rem] text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
            {copy.heroSubtitle}
          </p>

          <div className="mt-5 grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
            <Button variant="primary" size="lg" onClick={() => setActiveSection('find_care')}>
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>{copy.actionFindCare}</span>
            </Button>
            <Button variant="outline" size="lg" onClick={() => setActiveSection('triage')}>
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>{copy.navTriage}</span>
            </Button>
            <a
              href="tel:108"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 sm:px-5 min-h-[48px] sm:min-h-[52px] text-sm font-semibold text-[#C81E1E] dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors sm:whitespace-nowrap shrink-0"
            >
              <PhoneCall className="h-4 w-4 shrink-0" />
              <span>{copy.call108Now}</span>
            </a>
          </div>

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
            {copy.heroDisclaimer}
          </p>
        </div>

        <div className="lg:col-span-5 min-w-0">
          {!lowDataMode && !heroImgFailed ? (
            <div className="relative h-full min-h-[220px] sm:min-h-[280px] lg:min-h-[340px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              <img
                src="/src/assets/images/raksha_hero_care_1795065612925.jpg"
                alt="ASHA health worker guiding a rural family outside a Maharashtra Primary Health Centre"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 sm:p-5 text-white">
                <p className="text-sm font-semibold leading-snug">{copy.brandTagline}</p>
                <p className="mt-1 text-xs text-slate-200 leading-relaxed">
                  PHC → Rural Hospital → Sub-District &amp; District Trauma Network
                </p>
              </div>
            </div>
          ) : (
            <SurfaceCard className="h-full flex flex-col justify-center bg-gradient-to-br from-[#087F8C]/8 to-transparent">
              <h2 className="text-base font-semibold text-[#10243A] dark:text-white">
                {lowDataMode ? 'Low-Data Mode Active' : copy.brandTagline}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {lowDataMode
                  ? 'Heavy photographs are hidden to save bandwidth. Direct 108 / 112 calling, facility search, and offline referrals remain active.'
                  : 'PHC → Rural Hospital → Sub-District & District Trauma Network'}
              </p>
            </SurfaceCard>
          )}
        </div>
      </section>

      {/* Six Primary Patient Actions */}
      <section aria-labelledby="patient-actions-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4 sm:mb-5">
          <div className="min-w-0">
            <h2 id="patient-actions-heading" className="text-xl font-bold text-[#10243A] dark:text-white">
              Patient &amp; Family Care Actions
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Clear, accessible touch actions designed for patients, caregivers, and rural families.
            </p>
          </div>
          <button
            onClick={() => speakText(`${copy.heroTitle} ${copy.heroSubtitle}`, language)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] px-2 cursor-pointer shrink-0"
          >
            <Volume2 className="h-4 w-4 shrink-0" />
            <span>{copy.readAloud}</span>
          </button>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
          {primaryActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => (act.isEmergency ? onOpenEmergencyModal() : setActiveSection(act.id))}
                className={`text-left rounded-2xl border p-4 sm:p-5 transition-colors min-h-[104px] h-full flex items-start gap-3.5 sm:gap-4 cursor-pointer min-w-0 ${
                  act.isEmergency
                    ? 'border-red-300 dark:border-red-900 bg-red-50/75 dark:bg-red-950/30 hover:bg-red-50 dark:hover:bg-red-950/50'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#087F8C] dark:hover:border-[#16B8C5]'
                }`}
              >
                <div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                    act.isEmergency
                      ? 'bg-[#C81E1E] text-white'
                      : 'bg-[#087F8C]/10 text-[#087F8C] dark:bg-[#16B8C5]/15 dark:text-[#16B8C5]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-base font-semibold leading-snug break-words ${
                        act.isEmergency ? 'text-[#C81E1E] dark:text-red-300' : 'text-[#10243A] dark:text-white'
                      }`}
                    >
                      {act.title}
                    </h3>
                    <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{act.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Regional Access Gap Baseline + Navigation Assistant */}
      <section className="grid gap-6 lg:grid-cols-12 items-stretch">
        <SurfaceCard className="lg:col-span-7 flex flex-col">
          <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
            01. Maharashtra District Access Baseline
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Aggregated, non-PII public rural health travel-time baseline used for network planning. No patient data is exposed.
          </p>
          <div className="mt-4 overflow-x-auto flex-1">
            <table className="w-full text-left text-sm border-collapse min-w-[360px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-3 font-medium">District</th>
                  <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Rural Pop. (Lakhs)</th>
                  <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">PHCs</th>
                  <th className="py-2.5 pl-3 font-medium text-right whitespace-nowrap">Est. Travel</th>
                </tr>
              </thead>
              <tbody>
                {MAHARASHTRA_ACCESS_GAP_AGGREGATES.map((row) => (
                  <tr
                    key={row.district}
                    className="border-b border-slate-100 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 pr-3 font-medium text-[#10243A] dark:text-slate-100">{row.district}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.populationRuralLakhs.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.phcCount}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {row.avgTravelMinutesToEmergency} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        {/* Multilingual Non-Diagnostic Navigation Assistant */}
        <SurfaceCard className="lg:col-span-5 flex flex-col">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[#087F8C] dark:text-[#16B8C5] shrink-0" />
            <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
              02. Healthcare Navigation Assistant
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Non-diagnostic guidance in English, हिन्दी, or मराठी. Powered server-side with PII redaction.
          </p>

          <form onSubmit={handleFaqSubmit} className="mt-4 space-y-3">
            <label className="block">
              <span className="sr-only">Ask a navigation question</span>
              <textarea
                rows={3}
                value={faqQuery}
                onChange={(e) => setFaqQuery(e.target.value)}
                placeholder="Ask e.g. Where should I go for a high-risk pregnancy checkup in Baramati, or how do referrals work?"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-[#10243A] dark:text-slate-100 leading-relaxed"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Not for medical diagnosis</span>
              <Button type="submit" size="sm" disabled={faqLoading || !faqQuery.trim()}>
                <Send className="h-3.5 w-3.5 shrink-0" />
                <span>{faqLoading ? copy.loading : 'Ask Navigator'}</span>
              </Button>
            </div>
          </form>

          {faqError && (
            <div className="mt-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              {faqError}
            </div>
          )}

          {faqResponse && (
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-sm">
              <p className="text-slate-800 dark:text-slate-200 leading-relaxed">{faqResponse.answer}</p>
              <p className="text-xs font-medium text-[#C81E1E] dark:text-red-300 leading-relaxed">
                {faqResponse.emergencyReminder}
              </p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setActiveSection('assistant')}>
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Full AI Chat &amp; Live Voice</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setActiveSection('network_3d')}>
              <Box className="h-3.5 w-3.5 shrink-0" />
              <span>3D Corridor Twin</span>
            </Button>
          </div>
        </SurfaceCard>
      </section>

      {/* Role Portal Quick Entry */}
      <section className="grid gap-4 sm:gap-6 md:grid-cols-3 auto-rows-fr">
        <SurfaceCard className="flex flex-col justify-between">
          <div>
            <ShieldCheck className="h-5 w-5 text-[#087F8C] dark:text-[#16B8C5]" />
            <h3 className="mt-3 text-base font-semibold text-[#10243A] dark:text-white">
              ASHA / ANM Frontline Desk
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Assisted registration, Marathi/Hindi consent capture, and offline referral draft queueing for weak-signal villages.
            </p>
          </div>
          <button
            onClick={() => {
              setActivePortalTab('frontline');
              setActiveSection('portals');
            }}
            className="mt-4 self-start text-sm font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] inline-flex items-center cursor-pointer"
          >
            Open Frontline Portal →
          </button>
        </SurfaceCard>

        <SurfaceCard className="flex flex-col justify-between">
          <div>
            <Activity className="h-5 w-5 text-[#087F8C] dark:text-[#16B8C5]" />
            <h3 className="mt-3 text-base font-semibold text-[#10243A] dark:text-white">
              Hospital &amp; Referral Desk
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Acknowledge incoming transfers, publish verified bed/oxygen reports with expiry TTL, and verify QR referral passes.
            </p>
          </div>
          <button
            onClick={() => {
              setActivePortalTab('hospital');
              setActiveSection('portals');
            }}
            className="mt-4 self-start text-sm font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] inline-flex items-center cursor-pointer"
          >
            Open Hospital Portal →
          </button>
        </SurfaceCard>

        <SurfaceCard className="flex flex-col justify-between">
          <div>
            <PhoneCall className="h-5 w-5 text-[#C81E1E] dark:text-red-400" />
            <h3 className="mt-3 text-base font-semibold text-[#10243A] dark:text-white">
              Dispatcher &amp; Fleet Sandbox
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Evaluate explainable ambulance scoring, driver acceptance, and hospital arrival coordination inside the isolated Demo Sandbox.
            </p>
          </div>
          <button
            onClick={() => {
              setActivePortalTab('dispatcher');
              setActiveSection('portals');
            }}
            className="mt-4 self-start text-sm font-semibold text-[#087F8C] dark:text-[#16B8C5] hover:underline min-h-[44px] inline-flex items-center cursor-pointer"
          >
            Open Operations Console →
          </button>
        </SurfaceCard>
      </section>
    </div>
  );
};
