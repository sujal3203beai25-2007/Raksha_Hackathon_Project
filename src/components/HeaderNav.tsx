import {
  Box,
  CalendarClock,
  ChevronDown,
  Eye,
  FolderHeart,
  Globe,
  LogIn,
  LogOut,
  Moon,
  PhoneCall,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  User as UserIcon,
  Users,
  Wifi,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { AppSection, useApp } from '../context/AppContext.tsx';
import { seedDemoTenantIfNeeded } from '../services/firestoreService.ts';
import { LANGUAGE_LABELS, t } from '../shared/i18n.ts';
import { LanguageCode, TenantId, UserRole } from '../shared/types.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { Button } from './ui/Primitives.tsx';

export const HeaderNav: React.FC<{
  onOpenEmergencyModal: () => void;
}> = ({ onOpenEmergencyModal }) => {
  const {
    user,
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
    wsConnected,
    signInWithGoogle,
    logout,
  } = useApp();

  const copy = t(language);

  const [prefsOpen, setPrefsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const prefsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (prefsRef.current && !prefsRef.current.contains(e.target as Node)) {
        setPrefsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPrefsOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const navItems: Array<{ id: AppSection; label: string }> = [
    { id: 'find_care', label: copy.navFindCare },
    { id: 'triage', label: copy.navTriage },
    { id: 'referrals', label: copy.navReferrals },
    { id: 'assistant', label: 'AI & Voice' },
    { id: 'network_3d', label: '3D Twin' },
    { id: 'portals', label: copy.navPortals },
  ];

  const handleTenantSwitch = async (next: TenantId) => {
    setTenantId(next);
    if (next === 'demo-maharashtra' && user) {
      try {
        await seedDemoTenantIfNeeded(user.uid);
      } catch (err) {
        console.warn('Demo seed check:', err);
      }
    }
  };

  const activePrefsCount = [simplifiedMode, lowDataMode, reducedMotion].filter(Boolean).length;

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      {/* Row 1: Strict 3-Zone Top Bar Contract */}
      <header className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 md:gap-8">
        {/* Zone 1: Brand Lockup (single-line wordmark) */}
        <button
          onClick={() => setActiveSection('home')}
          className="flex items-center gap-2 sm:gap-2.5 text-left whitespace-nowrap shrink-0 min-h-[44px] cursor-pointer"
          aria-label="RAKSHA Home"
        >
          <img
            src="/icon.svg"
            alt="RAKSHA Shield Emblem"
            referrerPolicy="no-referrer"
            className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg shrink-0"
          />
          <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-[#10243A] dark:text-white whitespace-nowrap shrink-0">
            RAKSHA
          </span>
        </button>

        {/* Zone 2: 4 single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`text-sm font-medium whitespace-nowrap shrink-0 py-1.5 border-b-2 transition-colors cursor-pointer ${
                activeSection === item.id
                  ? 'border-[#087F8C] text-[#087F8C] dark:border-[#16B8C5] dark:text-[#16B8C5]'
                  : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-[#10243A] dark:hover:text-white hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 Primary Emergency Action (never overflows 320px) */}
        <div className="shrink-0">
          <Button
            variant="emergency"
            size="sm"
            onClick={onOpenEmergencyModal}
            aria-label={copy.ctaEmergency}
            className="min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-4 text-xs sm:text-sm whitespace-nowrap max-w-[164px] sm:max-w-none"
          >
            <PhoneCall className="h-4 w-4 shrink-0" />
            <span className="truncate">{copy.ctaEmergency}</span>
          </Button>
        </div>
      </header>

      {/* Row 2: Compact Workspace Controls & Profile Bar */}
      <div className="border-t border-slate-100 dark:border-slate-900 bg-[#F7FAFC] dark:bg-[#0B1523]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          {/* Left: Environment Switcher + Optional Demo Persona */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div
              role="group"
              aria-label="Operational environment mode"
              className="inline-flex items-center rounded-xl bg-slate-200/80 dark:bg-slate-800/90 p-1 shrink-0"
            >
              <button
                onClick={() => void handleTenantSwitch('mh-live')}
                className={`min-h-[34px] sm:min-h-[32px] px-2.5 sm:px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  tenantId === 'mh-live'
                    ? 'bg-white dark:bg-slate-900 text-[#10243A] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#10243A] dark:hover:text-white'
                }`}
              >
                Live Pilot
              </button>
              <button
                onClick={() => void handleTenantSwitch('demo-maharashtra')}
                className={`min-h-[34px] sm:min-h-[32px] px-2.5 sm:px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  tenantId === 'demo-maharashtra'
                    ? 'bg-[#087F8C] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-[#10243A] dark:hover:text-white'
                }`}
              >
                Demo Sandbox
              </button>
            </div>

            {tenantId === 'demo-maharashtra' && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 shrink-0">
                <span className="hidden sm:inline font-medium">Persona:</span>
                <select
                  aria-label="Demo Sandbox Persona Role"
                  value={activeRole}
                  onChange={(e) => setDemoPersonaRole(e.target.value as UserRole)}
                  className="min-h-[40px] sm:min-h-[36px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-medium text-[#10243A] dark:text-slate-100"
                >
                  <option value="patient">Patient</option>
                  <option value="frontline_worker">ASHA / ANM</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="ambulance_driver">Ambulance Driver</option>
                  <option value="hospital_coordinator">Hospital Desk</option>
                  <option value="platform_admin">Platform Admin</option>
                </select>
              </label>
            )}

            <span className="hidden xl:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {wsConnected ? 'Realtime Sync Active' : 'Polling Sync'}
            </span>
          </div>

          {/* Right: Language + Theme + Accessibility Menu + Compact Profile Menu */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 ml-auto max-w-full">
            {/* Language Switcher */}
            <label className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 sm:px-2.5 min-h-[40px] sm:min-h-[36px] text-xs text-[#10243A] dark:text-slate-100 shrink-0">
              <Globe className="h-3.5 w-3.5 text-[#087F8C] dark:text-[#16B8C5] shrink-0" />
              <select
                aria-label="Select Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer pr-1"
              >
                {(['en', 'hi', 'mr'] as LanguageCode[]).map((code) => (
                  <option key={code} value={code} className="bg-white dark:bg-slate-900 text-[#10243A] dark:text-slate-100">
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>

            {/* Theme Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 min-h-[40px] min-w-[40px] sm:min-h-[36px] sm:min-w-[36px] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Display & Accessibility Preferences Dropdown */}
            <div ref={prefsRef} className="relative">
              <button
                onClick={() => {
                  setPrefsOpen((prev) => !prev);
                  setProfileOpen(false);
                }}
                aria-expanded={prefsOpen}
                aria-haspopup="true"
                aria-label="Display and accessibility preferences"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                  activePrefsCount > 0
                    ? 'border-[#087F8C] bg-[#087F8C]/10 text-[#087F8C] dark:border-[#16B8C5] dark:bg-[#16B8C5]/15 dark:text-[#16B8C5]'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Display</span>
              </button>

              {prefsOpen && (
                <div
                  role="dialog"
                  aria-label="Accessibility and display preferences"
                  className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xl z-50 space-y-2"
                >
                  <div className="px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Accessibility &amp; Bandwidth
                  </div>

                  <button
                    onClick={() => setSimplifiedMode(!simplifiedMode)}
                    aria-pressed={simplifiedMode}
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 min-h-[44px] text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 font-medium text-[#10243A] dark:text-slate-100">
                      <Eye className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                      {copy.simplifiedMode}
                    </span>
                    <span className={`font-semibold ${simplifiedMode ? 'text-[#087F8C] dark:text-[#16B8C5]' : 'text-slate-400'}`}>
                      {simplifiedMode ? 'On' : 'Off'}
                    </span>
                  </button>

                  <button
                    onClick={() => setLowDataMode(!lowDataMode)}
                    aria-pressed={lowDataMode}
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 min-h-[44px] text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 font-medium text-[#10243A] dark:text-slate-100">
                      <Wifi className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                      {copy.lowDataMode}
                    </span>
                    <span className={`font-semibold ${lowDataMode ? 'text-[#087F8C] dark:text-[#16B8C5]' : 'text-slate-400'}`}>
                      {lowDataMode ? 'On' : 'Off'}
                    </span>
                  </button>

                  <button
                    onClick={() => setReducedMotion(!reducedMotion)}
                    aria-pressed={reducedMotion}
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 min-h-[44px] text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="font-medium text-[#10243A] dark:text-slate-100">Reduce Motion</span>
                    <span className={`font-semibold ${reducedMotion ? 'text-[#087F8C] dark:text-[#16B8C5]' : 'text-slate-400'}`}>
                      {reducedMotion ? 'On' : 'Off'}
                    </span>
                  </button>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <button
                      onClick={() => {
                        setActiveSection('assistant');
                        setPrefsOpen(false);
                      }}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 min-h-[42px] text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                      <span>AI Navigator &amp; Live Voice</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveSection('network_3d');
                        setPrefsOpen(false);
                      }}
                      className="w-full flex items-center gap-2 rounded-xl px-3 py-2 min-h-[42px] text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Box className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                      <span>3D Care Corridor Twin</span>
                    </button>
                    <PWAInstallButton fullWidth />
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown or Sign In Button */}
            {user ? (
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => {
                    setProfileOpen((prev) => !prev);
                    setPrefsOpen(false);
                  }}
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-[#10243A] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <UserIcon className="h-3.5 w-3.5 text-[#087F8C] dark:text-[#16B8C5] shrink-0" />
                  <span className="max-w-[64px] sm:max-w-[130px] truncate">
                    {user.displayName || user.email}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>

                {profileOpen && (
                  <div
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl z-50"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-semibold text-[#10243A] dark:text-white truncate">
                        {user.displayName || 'Citizen User'}
                      </div>
                      {user.email && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {user.email}
                        </div>
                      )}
                      <div className="text-[11px] text-[#087F8C] dark:text-[#16B8C5] mt-1 font-medium">
                        Role: {verifiedRole.replace(/_/g, ' ')}
                      </div>
                    </div>

                    <div className="py-1 space-y-0.5">
                      <button
                        role="menuitem"
                        onClick={() => {
                          setActiveSection('records');
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <FolderHeart className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                        <span>{copy.actionHealthRecords}</span>
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setActiveSection('follow_ups');
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <CalendarClock className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                        <span>{copy.actionFollowUps}</span>
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setActiveSection('family');
                          setProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-[42px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Users className="h-4 w-4 text-[#087F8C] dark:text-[#16B8C5]" />
                        <span>{copy.actionFamilyCare}</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        role="menuitem"
                        onClick={() => {
                          setProfileOpen(false);
                          void logout();
                        }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-[42px] text-xs font-semibold text-[#C81E1E] dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>{copy.signOut}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#10243A] dark:bg-[#16B8C5] px-3 min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-white dark:text-[#0B1523] hover:opacity-95 transition-opacity cursor-pointer shrink-0"
              >
                <LogIn className="h-3.5 w-3.5 shrink-0" />
                <span>{copy.signInGoogle}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Well-Spaced, Readable Environment & Emergency Notice */}
      <div
        role="region"
        aria-label="Environment and emergency notice"
        className={`border-t ${
          tenantId === 'demo-maharashtra'
            ? 'bg-[#087F8C]/8 dark:bg-[#16B8C5]/10 border-[#087F8C]/20 dark:border-[#16B8C5]/25'
            : 'bg-amber-50/75 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-900/60'
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldAlert
              className={`h-4 w-4 mt-0.5 shrink-0 ${
                tenantId === 'demo-maharashtra'
                  ? 'text-[#087F8C] dark:text-[#16B8C5]'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
            />
            <p className="text-xs sm:text-[13px] leading-relaxed text-[#10243A] dark:text-slate-100">
              {tenantId === 'demo-maharashtra' ? copy.demoSandboxBanner : copy.liveModeBanner}
            </p>
          </div>
          <div className="flex items-center gap-3 pl-6 sm:pl-0 shrink-0">
            <a
              href="tel:108"
              className="text-xs font-semibold text-[#C81E1E] dark:text-red-300 hover:underline whitespace-nowrap"
            >
              108 / 112 Hotline →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
