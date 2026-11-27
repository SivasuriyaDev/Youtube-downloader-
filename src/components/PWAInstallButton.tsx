import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  onOpenAndroidGuide?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  onOpenAndroidGuide,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 ${
          compact ? 'min-h-[44px] px-3 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
        }`}
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Add to Home</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <h2 id="ios-install-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Install VeloSave
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="inline-flex min-h-[44px] min-w-[44px] -mt-2 -mr-2 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>1. Tap the Share button in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and choose Add to Home Screen.</li>
                <li>3. Tap Add to launch VeloSave full-screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (onOpenAndroidGuide && !compact) {
    return (
      <button
        type="button"
        onClick={onOpenAndroidGuide}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
      >
        <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Android App</span>
      </button>
    );
  }

  return null;
};
