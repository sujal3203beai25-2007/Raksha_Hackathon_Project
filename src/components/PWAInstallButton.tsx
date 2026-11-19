import { Download } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { Button, ModalDialog } from './ui/Primitives.tsx';

export const PWAInstallButton: React.FC<{ fullWidth?: boolean }> = ({ fullWidth = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={fullWidth ? 'w-full justify-between' : undefined}
        onClick={install}
        aria-label="Install RAKSHA App"
      >
        <span className="inline-flex items-center gap-2">
          <Download className="h-4 w-4 shrink-0" />
          <span>Install RAKSHA App</span>
        </span>
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className={fullWidth ? 'w-full justify-between' : undefined}
          onClick={() => setShowIOSGuide(true)}
        >
          <span className="inline-flex items-center gap-2">
            <Download className="h-4 w-4 shrink-0" />
            <span>Install on iOS</span>
          </span>
        </Button>
        <ModalDialog
          open={showIOSGuide}
          onOpenChange={setShowIOSGuide}
          title="Install RAKSHA on iPhone or iPad"
          description="Add RAKSHA to your home screen for fast emergency and referral access."
        >
          <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <li>Tap the Share button in Safari&apos;s toolbar.</li>
            <li>Scroll down and tap Add to Home Screen.</li>
            <li>Tap Add in the top right corner.</li>
          </ol>
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowIOSGuide(false)}>
              Close
            </Button>
          </div>
        </ModalDialog>
      </>
    );
  }

  return null;
};
