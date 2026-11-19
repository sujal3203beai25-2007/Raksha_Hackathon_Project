import { Activity, FolderHeart, Home, MapPin, PhoneCall } from 'lucide-react';
import React from 'react';
import { AppSection, useApp } from '../context/AppContext.tsx';
import { t } from '../shared/i18n.ts';

export const MobileBottomBar: React.FC<{ onOpenEmergencyModal: () => void }> = ({
  onOpenEmergencyModal,
}) => {
  const { activeSection, setActiveSection, language } = useApp();
  const copy = t(language);

  const tabs: Array<{
    id: AppSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isEmergency?: boolean;
  }> = [
    { id: 'home', label: copy.bottomHome, icon: Home },
    { id: 'find_care', label: copy.bottomCare, icon: MapPin },
    { id: 'emergency', label: copy.bottomEmergency, icon: PhoneCall, isEmergency: true },
    { id: 'referrals', label: copy.bottomReferrals, icon: Activity },
    { id: 'records', label: copy.bottomRecords, icon: FolderHeart },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-safe border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md shadow-[0_-2px_10px_rgba(16,36,58,0.06)]"
    >
      <div className="grid grid-cols-5 h-16 w-full items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => (tab.isEmergency ? onOpenEmergencyModal() : setActiveSection(tab.id))}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 min-w-0 min-h-[48px] px-0.5 sm:px-1 transition-colors cursor-pointer ${
                tab.isEmergency
                  ? active
                    ? 'text-[#C81E1E] dark:text-red-300 font-semibold'
                    : 'text-[#C81E1E] dark:text-red-400 font-medium'
                  : active
                    ? 'text-[#087F8C] dark:text-[#16B8C5] font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-[#10243A] dark:hover:text-slate-200'
              }`}
            >
              {/* Active top indicator bar */}
              <span
                aria-hidden="true"
                className={`absolute top-0 h-0.5 w-8 rounded-full transition-opacity ${
                  active
                    ? tab.isEmergency
                      ? 'bg-[#C81E1E] opacity-100'
                      : 'bg-[#087F8C] dark:bg-[#16B8C5] opacity-100'
                    : 'opacity-0'
                }`}
              />
              <span
                className={`flex items-center justify-center rounded-lg px-2 sm:px-2.5 py-0.5 transition-colors ${
                  active
                    ? tab.isEmergency
                      ? 'bg-red-100 dark:bg-red-950/60'
                      : 'bg-[#087F8C]/12 dark:bg-[#16B8C5]/18'
                    : ''
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </span>
              <span className="text-[10.5px] sm:text-[11px] leading-tight tracking-tight truncate max-w-full text-center">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
