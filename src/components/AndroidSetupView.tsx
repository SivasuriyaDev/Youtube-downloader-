import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  RefreshCw,
  Share2,
  Smartphone,
  Terminal,
  Wifi,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  DEFAULT_ANDROID_ENGINE_URL,
  resolveApiBaseUrl,
  validateEngineBaseUrl,
  type EngineSettings,
  type ExecutionEngineMode,
} from '../utils/engineConfig';

interface AndroidSetupViewProps {
  engineSettings: EngineSettings;
  onUpdateEngineSettings: (next: EngineSettings) => void;
  onTestShareLink: (url: string) => void;
}

export const AndroidSetupView: React.FC<AndroidSetupViewProps> = ({
  engineSettings,
  onUpdateEngineSettings,
  onTestShareLink,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'connected' | 'offline'>('idle');
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const termuxCommand = `pkg update -y && pkg install -y nodejs yt-dlp ffmpeg curl && curl -fsSL "${origin}/velosave-android.mjs" -o "$HOME/velosave-android.mjs" && node "$HOME/velosave-android.mjs"`;

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(termuxCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2500);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleTestEngine = async () => {
    if (engineSettings.mode === 'custom' && !validateEngineBaseUrl(engineSettings.customUrl)) {
      setCustomUrlError('Enter a valid http:// or https:// server URL.');
      return;
    }
    setCustomUrlError(null);
    setPingStatus('checking');
    const base = resolveApiBaseUrl(engineSettings);
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000) });
      setPingStatus(res.ok ? 'connected' : 'offline');
    } catch {
      setPingStatus('offline');
    }
  };

  const handleModeSelect = (mode: ExecutionEngineMode) => {
    setPingStatus('idle');
    setCustomUrlError(null);
    onUpdateEngineSettings({ ...engineSettings, mode });
  };

  return (
    <section aria-labelledby="android-setup-heading" className="space-y-6">
      <div>
        <h1
          id="android-setup-heading"
          className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
        >
          Android Execution Engine &amp; App Setup
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Run extraction directly on your Android phone&apos;s IP via Termux so YouTube videos, playlists, Instagram Reels, and Spotify playlist tracks download without datacenter blocks.
        </p>
      </div>

      {/* Execution Mode Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Cpu className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                Execution Mode
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose where VeloSave inspects links and downloads video streams.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestEngine}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${pingStatus === 'checking' ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>
              {pingStatus === 'checking'
                ? 'Checking...'
                : pingStatus === 'connected'
                ? 'Engine Connected'
                : pingStatus === 'offline'
                ? 'Not Running — Retry'
                : 'Test Connection'}
            </span>
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => handleModeSelect('cloud')}
            aria-pressed={engineSettings.mode === 'cloud'}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
              engineSettings.mode === 'cloud'
                ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/35'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
            }`}
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Cloud Server
            </span>
            <span className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Built-in server yt-dlp engine. Ideal when hosted with cookies or proxy.
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect('android_local')}
            aria-pressed={engineSettings.mode === 'android_local'}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
              engineSettings.mode === 'android_local'
                ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/35'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
            }`}
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Android Local Engine
            </span>
            <span className="mt-1 font-mono text-xs text-blue-600 dark:text-blue-400">
              {DEFAULT_ANDROID_ENGINE_URL}
            </span>
            <span className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Runs directly on your Android phone via Termux for all YouTube &amp; Instagram videos.
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect('custom')}
            aria-pressed={engineSettings.mode === 'custom'}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
              engineSettings.mode === 'custom'
                ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/35'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
            }`}
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Custom LAN / VPS Server
            </span>
            <span className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Point VeloSave to your own home PC or self-hosted extraction server.
            </span>
          </button>
        </div>

        {engineSettings.mode === 'custom' && (
          <div className="mt-4 space-y-2">
            <label htmlFor="custom-engine-url" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Custom Engine Base URL
            </label>
            <input
              id="custom-engine-url"
              type="url"
              placeholder="http://192.168.1.50:3847"
              value={engineSettings.customUrl}
              onChange={(e) => {
                setCustomUrlError(null);
                onUpdateEngineSettings({ ...engineSettings, customUrl: e.target.value });
              }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            {customUrlError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{customUrlError}</p>
            )}
          </div>
        )}

        {/* Termux On-Device Setup */}
        <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Terminal className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Start On-Device Engine in Termux (Android)</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Install Termux on Android, run this single command once, then select Android Local Engine above. All YouTube 4K/1080p/MP3 and Instagram Reels will download directly through your mobile IP.
          </p>

          <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-3.5 font-mono text-xs text-slate-100 dark:border-slate-800">
            <code>{termuxCommand}</code>
          </pre>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyCommand}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700"
            >
              {copiedCmd ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Command Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>Copy Termux Command</span>
                </>
              )}
            </button>

            <a
              href="/api/android-script"
              download="velosave-termux-setup.sh"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Download Setup Script</span>
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card 1: Install on Android */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {isInstalled ? 'Installed' : isInstallable ? 'Ready to install' : 'Browser mode'}
              </span>
            </div>

            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Home Screen App Installation
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Install VeloSave to your Android Home Screen as a standalone app without sideloading an APK.
            </p>

            <ol className="space-y-2 pt-1 text-sm text-slate-700 dark:text-slate-300">
              <li>1. Open VeloSave in Chrome on your Android phone.</li>
              <li>2. Tap Install App below or Chrome menu (⋮) → Install app.</li>
              <li>3. Launch VeloSave full-screen from your app drawer.</li>
            </ol>

            {isIOS && (
              <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                On iPhone or iPad, tap Share in Safari and choose Add to Home Screen.
              </p>
            )}
          </div>

          <div className="mt-6">
            {isInstalled ? (
              <div className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Running as Installed App</span>
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Install VeloSave on Device</span>
              </button>
            ) : (
              <div className="rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
                Use Chrome&apos;s menu (⋮ → Add to Home screen) on Android when the native prompt is not shown automatically.
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Android Share Sheet */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Share2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </span>
            </div>

            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Share Directly from YouTube &amp; Instagram
            </h2>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Once installed on Android, VeloSave registers as a system Share Target so you do not have to copy and paste links manually.
            </p>

            <ol className="space-y-2 pt-1 text-sm text-slate-700 dark:text-slate-300">
              <li>1. Tap Share inside YouTube, Shorts, or Instagram Reels.</li>
              <li>2. Pick VeloSave from the Android share sheet.</li>
              <li>3. VeloSave opens and fetches the formats automatically.</li>
            </ol>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => onTestShareLink('https://www.instagram.com/reel/C8xYz9AbCdE/')}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              <span>Simulate Android Share Link</span>
            </button>
          </div>
        </div>
      </div>

      {/* GitHub Actions APK Auto-Build Info */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          Automatic Android APK Builds (GitHub Actions)
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Push this repository to GitHub on <span className="font-mono text-xs text-slate-800 dark:text-slate-200">main</span> or tag a release (<span className="font-mono text-xs text-slate-800 dark:text-slate-200">v1.0.0</span>) to automatically build <span className="font-mono text-xs text-slate-800 dark:text-slate-200">VeloSave-debug.apk</span> via <span className="font-mono text-xs text-slate-800 dark:text-slate-200">.github/workflows/build-android-apk.yml</span>. Add optional keystore secrets for signed release APKs.
        </p>
      </div>
    </section>
  );
};
