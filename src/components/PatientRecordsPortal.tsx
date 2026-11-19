import {
  CalendarClock,
  CheckCircle2,
  Download,
  FolderHeart,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AppSection, useApp } from '../context/AppContext.tsx';
import {
  addDependent,
  addHealthRecord,
  createFollowUpTask,
  loadUserPrivateInfo,
  removeDependent,
  saveUserPrivateInfo,
  submitDsrRequest,
  toggleConsent,
  updateFollowUpStatus,
} from '../services/firestoreService.ts';
import { t } from '../shared/i18n.ts';
import {
  ConsentPurpose,
  ConsentRecord,
  DependentRecord,
  FollowUpItem,
  HealthRecordItem,
} from '../shared/types.ts';
import { Button, EmptyState, SurfaceCard } from './ui/Primitives.tsx';

const CONSENT_ITEMS: Array<{ purpose: ConsentPurpose; title: string; desc: string }> = [
  {
    purpose: 'triage_sharing',
    title: 'Share Triage Summary with Receiving Facility',
    desc: 'Allows selected PHCs/hospitals to view your symptom navigation rationale.',
  },
  {
    purpose: 'referral_sharing',
    title: 'Share Clinical Referral & Handover Notes',
    desc: 'Permits origin and destination coordinators to exchange referral summaries.',
  },
  {
    purpose: 'emergency_gps',
    title: 'Share Location During Active Emergency Request',
    desc: 'Shares device coordinates only while an emergency request is open.',
  },
  {
    purpose: 'ai_summarization',
    title: 'Allow AI Handover Summarization (Human-Reviewed)',
    desc: 'Permits server-side Gemini summarization of redacted referral notes (always pending clinician review).',
  },
  {
    purpose: 'family_access',
    title: 'Allow Authorized Caregiver / Dependent View',
    desc: 'Enables guardian-confirmed family care coordination.',
  },
];

export const PatientRecordsPortal: React.FC<{
  section: Extract<AppSection, 'records' | 'follow_ups' | 'family'>;
  consents: ConsentRecord[];
  dependents: DependentRecord[];
  healthRecords: HealthRecordItem[];
  followUps: FollowUpItem[];
}> = ({ section, consents, dependents, healthRecords, followUps }) => {
  const { language, user, tenantId, signInWithGoogle, setActiveSection } = useApp();
  const copy = t(language);

  // Private Profile PII State
  const [profile, setProfile] = useState<Record<string, string>>({
    phone: '',
    village: '',
    taluka: '',
    district: 'Pune',
    bloodGroup: '',
    allergies: '',
    medications: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  // Add Health Record state
  const [recTitle, setRecTitle] = useState('');
  const [recCategory, setRecCategory] = useState<HealthRecordItem['category']>('prescription');
  const [recFacility, setRecFacility] = useState('');
  const [recSummary, setRecSummary] = useState('');
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10));

  // Add Dependent state
  const [depName, setDepName] = useState('');
  const [depRel, setDepRel] = useState('Parent');
  const [depAge, setDepAge] = useState('68');
  const [depConfirmed, setDepConfirmed] = useState(false);

  // Add Follow-Up state
  const [fupTitle, setFupTitle] = useState('');
  const [fupDue, setFupDue] = useState(new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  const [fupNotes, setFupNotes] = useState('');

  // DSR state
  const [dsrNotice, setDsrNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadUserPrivateInfo(user.uid)
      .then((data) => {
        if (Object.keys(data).length > 0) {
          setProfile((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <SurfaceCard className="text-center space-y-4">
          <h1 className="text-xl font-bold text-[#10243A] dark:text-white">
            {section === 'records'
              ? copy.actionHealthRecords
              : section === 'follow_ups'
                ? copy.actionFollowUps
                : copy.actionFamilyCare}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
            Sign in with Google to access private health records, granular DPDP consents, follow-ups, and authorized family care.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => void signInWithGoogle()}>{copy.signInGoogle}</Button>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveUserPrivateInfo(user.uid, { ...profile, email: user.email || '' });
    setProfileSavedMsg('Private profile & safety details saved under owner-only Firestore isolation.');
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recTitle.trim() || !recSummary.trim()) return;
    await addHealthRecord(user.uid, {
      title: recTitle.trim(),
      category: recCategory,
      facilityName: recFacility.trim() || undefined,
      summary: recSummary.trim(),
      recordedDate: recDate,
    });
    setRecTitle('');
    setRecSummary('');
  };

  const handleAddDependent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depName.trim() || !depConfirmed) return;
    await addDependent(user.uid, {
      name: depName.trim(),
      relationship: depRel,
      ageYears: Number(depAge) || 0,
      guardianConfirmed: depConfirmed,
    });
    setDepName('');
    setDepConfirmed(false);
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fupTitle.trim()) return;
    await createFollowUpTask({
      tenantId,
      patientUid: user.uid,
      title: fupTitle.trim(),
      dueDate: fupDue,
      notes: fupNotes.trim() || undefined,
    });
    setFupTitle('');
    setFupNotes('');
  };

  const handleExportJson = async () => {
    const reqId = await submitDsrRequest(user.uid, 'export');
    const bundle = {
      exportedAt: new Date().toISOString(),
      dsrRequestId: reqId,
      uid: user.uid,
      displayName: user.displayName,
      privateProfile: profile,
      consents,
      dependents,
      healthRecords,
      followUps,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raksha-dpdp-export-${user.uid.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDsrNotice(`Data export downloaded and logged (DSR ID: ${reqId}).`);
  };

  const handleDeletionRequest = async () => {
    const reqId = await submitDsrRequest(user.uid, 'deletion');
    setDsrNotice(
      `DPDP erasure request logged (${reqId}). Statutory clinical/audit logs remain immutable per healthcare retention rules; personal profile fields are queued for deletion.`
    );
  };

  const sectionTabs: Array<{
    id: Extract<AppSection, 'records' | 'follow_ups' | 'family'>;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'records', label: 'Records & Privacy', icon: FolderHeart },
    { id: 'follow_ups', label: 'Follow-Ups', icon: CalendarClock },
    { id: 'family', label: 'Family Care', icon: Users },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Section Header Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[#10243A] dark:text-white tracking-tight">
            {section === 'records'
              ? copy.actionHealthRecords
              : section === 'follow_ups'
                ? copy.actionFollowUps
                : copy.actionFamilyCare}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            DPDP-aligned personal health wallet with revocable granular consents and guardian-verified family care.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Personal records views"
          className="grid grid-cols-1 sm:inline-flex rounded-xl bg-slate-200/75 dark:bg-slate-800 p-1 gap-1 border border-slate-200/80 dark:border-slate-700/60 w-full lg:w-auto shrink-0"
        >
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(tab.id)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 min-h-[44px] sm:min-h-[38px] text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#10243A] dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {section === 'records' && (
        <>
          {/* Private Profile & Clinical Safety Fields */}
          <SurfaceCard>
            <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
              Personal Profile, Allergies &amp; Emergency Contact
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Stored in an isolated owner-only subcollection (<code>users/{'{uid}'}/private/info</code>). Never visible to public directories.
            </p>
            <form onSubmit={handleSaveProfile} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Mobile Phone</span>
                <input
                  type="tel"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Village / Town</span>
                <input
                  type="text"
                  value={profile.village || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, village: e.target.value }))}
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Taluka / District</span>
                <input
                  type="text"
                  value={profile.district || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, district: e.target.value }))}
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Blood Group (Optional)</span>
                <input
                  type="text"
                  value={profile.bloodGroup || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, bloodGroup: e.target.value }))}
                  placeholder="e.g. O+"
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Known Allergies (Optional)</span>
                <input
                  type="text"
                  value={profile.allergies || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, allergies: e.target.value }))}
                  placeholder="e.g. Penicillin, Sulfa"
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Current Medications (Optional)</span>
                <input
                  type="text"
                  value={profile.medications || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, medications: e.target.value }))}
                  placeholder="e.g. Amlodipine 5mg"
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Emergency Contact Name</span>
                <input
                  type="text"
                  value={profile.emergencyContactName || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, emergencyContactName: e.target.value }))}
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <label className="text-xs min-w-0">
                <span className="font-medium text-slate-600 dark:text-slate-300">Emergency Contact Phone</span>
                <input
                  type="tel"
                  value={profile.emergencyContactPhone || ''}
                  onChange={(e) => setProfile((p) => ({ ...p, emergencyContactPhone: e.target.value }))}
                  className="mt-1 w-full min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-1 flex items-end">
                <Button type="submit" className="w-full">
                  Save Private Profile
                </Button>
              </div>
            </form>
            {profileSavedMsg && (
              <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">{profileSavedMsg}</p>
            )}
          </SurfaceCard>

          {/* Granular DPDP Consents */}
          <SurfaceCard>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#087F8C] shrink-0" />
              <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
                Granular Revocable DPDP Consents
              </h2>
            </div>
            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {CONSENT_ITEMS.map((item) => {
                const existing = consents.find((c) => c.purpose === item.purpose);
                const granted = Boolean(existing?.granted);
                return (
                  <div
                    key={item.purpose}
                    className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="max-w-xl min-w-0">
                      <div className="text-sm font-semibold text-[#10243A] dark:text-white">{item.title}</div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                    <Button
                      variant={granted ? 'primary' : 'outline'}
                      size="sm"
                      className="w-full sm:w-auto shrink-0"
                      onClick={() => void toggleConsent(user.uid, item.purpose, !granted)}
                    >
                      {granted ? 'Granted (Tap to Revoke)' : 'Not Granted (Tap to Grant)'}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                DPDP Data Principal Rights: download your portable JSON record or log a deletion request.
              </div>
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => void handleExportJson()}>
                  <Download className="h-4 w-4 shrink-0" />
                  <span>Export My Data (JSON)</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => void handleDeletionRequest()}>
                  <Trash2 className="h-4 w-4 text-[#C81E1E] shrink-0" />
                  <span>Request Data Deletion</span>
                </Button>
              </div>
            </div>
            {dsrNotice && <p className="mt-2.5 text-xs text-[#087F8C] dark:text-[#16B8C5]">{dsrNotice}</p>}
          </SurfaceCard>

          {/* Health Records Log */}
          <SurfaceCard>
            <h2 className="text-lg font-bold text-[#10243A] dark:text-white">Personal Health Documents &amp; Notes</h2>
            <form onSubmit={handleAddRecord} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input
                type="text"
                required
                value={recTitle}
                onChange={(e) => setRecTitle(e.target.value)}
                placeholder="Document title (e.g. PHC HbA1c Lab)"
                className="sm:col-span-2 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <select
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value as HealthRecordItem['category'])}
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                <option value="prescription">Prescription</option>
                <option value="lab_report">Lab Report</option>
                <option value="discharge_summary">Discharge Summary</option>
                <option value="immunization">Immunization</option>
                <option value="self_note">Personal Note</option>
              </select>
              <input
                type="date"
                value={recDate}
                onChange={(e) => setRecDate(e.target.value)}
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <input
                type="text"
                value={recFacility}
                onChange={(e) => setRecFacility(e.target.value)}
                placeholder="Facility name (optional)"
                className="sm:col-span-2 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <input
                type="text"
                required
                value={recSummary}
                onChange={(e) => setRecSummary(e.target.value)}
                placeholder="Key findings or notes"
                className="sm:col-span-2 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <Button type="submit" size="sm" className="w-full sm:w-auto">
                  Add Record Summary
                </Button>
              </div>
            </form>

            <div className="mt-5">
              {healthRecords.length === 0 ? (
                <EmptyState
                  title="No saved records yet"
                  description="Add prescriptions, lab findings, or discharge notes to carry with you between clinics."
                />
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                  {healthRecords.map((rec) => (
                    <div key={rec.recordId} className="py-3.5 text-sm">
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {rec.category.replace(/_/g, ' ').toUpperCase()}
                          {rec.facilityName ? ` · ${rec.facilityName}` : ''}
                        </span>
                        <span className="font-mono tabular-nums">{rec.recordedDate}</span>
                      </div>
                      <div className="mt-1 font-semibold text-[#10243A] dark:text-white">{rec.title}</div>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{rec.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SurfaceCard>
        </>
      )}

      {section === 'follow_ups' && (
        <SurfaceCard>
          <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
            Continuity &amp; Post-Discharge Follow-Ups
          </h2>
          <form onSubmit={handleAddFollowUp} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-center">
            <input
              type="text"
              required
              value={fupTitle}
              onChange={(e) => setFupTitle(e.target.value)}
              placeholder="Follow-up visit or ASHA checkup"
              className="sm:col-span-2 min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            />
            <input
              type="date"
              value={fupDue}
              onChange={(e) => setFupDue(e.target.value)}
              className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
            />
            <Button type="submit" className="w-full sm:w-auto">
              Schedule Task
            </Button>
          </form>

          <div className="mt-5">
            {followUps.length === 0 ? (
              <EmptyState
                title="No follow-up tasks scheduled"
                description="Post-discharge visits or ASHA home checks appear here."
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                {followUps.map((f) => (
                  <div
                    key={f.followUpId}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono tabular-nums text-slate-500">
                        Due: {f.dueDate} · Status: {f.status.toUpperCase()}
                      </div>
                      <div className="text-sm font-semibold text-[#10243A] dark:text-white mt-0.5 break-words">{f.title}</div>
                    </div>
                    {f.status !== 'completed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto shrink-0"
                        onClick={() => void updateFollowUpStatus(f.followUpId, 'completed', 'Confirmed by patient/worker')}
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Mark Completed</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SurfaceCard>
      )}

      {section === 'family' && (
        <SurfaceCard>
          <h2 className="text-lg font-bold text-[#10243A] dark:text-white">
            Authorized Dependent &amp; Family Care
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Explicit guardian/caregiver confirmation is required before adding elderly parents or children for assisted referrals.
          </p>

          <form onSubmit={handleAddDependent} className="mt-4 space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                value={depName}
                onChange={(e) => setDepName(e.target.value)}
                placeholder="Dependent full name"
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
              <select
                value={depRel}
                onChange={(e) => setDepRel(e.target.value)}
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              >
                <option value="Parent">Elderly Parent</option>
                <option value="Child">Child / Minor</option>
                <option value="Spouse">Spouse</option>
                <option value="Sibling">Dependent Relative</option>
              </select>
              <input
                type="number"
                min={0}
                max={120}
                value={depAge}
                onChange={(e) => setDepAge(e.target.value)}
                placeholder="Age"
                className="min-w-0 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
              />
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer py-1 leading-relaxed">
              <input
                type="checkbox"
                required
                checked={depConfirmed}
                onChange={(e) => setDepConfirmed(e.target.checked)}
                className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 accent-[#087F8C] shrink-0"
              />
              <span>
                I confirm that I am the legal guardian or have explicit consent from this family member to manage their healthcare coordination under DPDP norms.
              </span>
            </label>

            <Button type="submit" className="w-full sm:w-auto" disabled={!depConfirmed || !depName.trim()}>
              <UserPlus className="h-4 w-4 shrink-0" />
              <span>Add Authorized Dependent</span>
            </Button>
          </form>

          <div className="mt-5">
            {dependents.length === 0 ? (
              <EmptyState
                title="No dependents added"
                description="Add an authorized dependent above for assisted triage or referrals."
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800">
                {dependents.map((d) => (
                  <div
                    key={d.dependentId}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#10243A] dark:text-white break-words">
                        {d.name} ({d.relationship}, {d.ageYears} yrs)
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Guardian authorization confirmed
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto shrink-0"
                      onClick={() => void removeDependent(user.uid, d.dependentId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SurfaceCard>
      )}
    </div>
  );
};
