import { WifiOff } from 'lucide-react';
import React from 'react';
import { useApp } from '../context/AppContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { t } from '../shared/i18n.ts';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { language, firestoreOffline } = useApp();
  const copy = t(language);

  if (isOnline && !firestoreOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-700 text-white px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{copy.offlineBanner}</span>
    </div>
  );
};
