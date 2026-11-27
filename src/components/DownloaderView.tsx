import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ClipboardPaste,
  Cpu,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Music,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import type { FormatKind, InspectedMedia, LibraryItem, MediaFormat } from '../types/media';
import type { ExecutionEngineMode } from '../utils/engineConfig';
import { QUICK_SAMPLE_LINKS } from '../data/sampleMedia';
import { formatBytes, formatDuration } from '../utils/mediaParser';
import { MediaThumbnail } from './MediaThumbnail';

interface DownloaderViewProps {
  urlInput: string;
  onUrlInputChange: (val: string) => void;
  isInspecting: boolean;
  inspectError: string | null;
  inspectErrorCode: string | null;
  inspectedMedia: InspectedMedia | null;
  onInspect: (targetUrl?: string) => void;
  onStartDownload: (media: InspectedMedia, format: MediaFormat) => void;
  recentLibrary: LibraryItem[];
  engineMode: ExecutionEngineMode;
  onEngineModeChange: (mode: ExecutionEngineMode) => void;
  onOpenLibrary: () => void;
  onOpenAndroid: () => void;
}

export const DownloaderView: React.FC<DownloaderViewProps> = ({
  urlInput,
  onUrlInputChange,
  isInspecting,
  inspectError,
  inspectErrorCode,
  inspectedMedia,
  onInspect,
  onStartDownload,
  recentLibrary,
  engineMode,
  onEngineModeChange,
  onOpenLibrary,
  onOpenAndroid,
}) => {
  const [formatFilter, setFormatFilter] = useState<'all' | FormatKind>('all');
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  useEffect(() => {
    if (inspectedMedia && inspectedMedia.formats.length > 0) {
      setFormatFilter('all');
      setSelectedFormatId(inspectedMedia.formats[0].id);
    } else {
      setSelectedFormatId(null);
    }
  }, [inspectedMedia]);

  const handlePaste = async () => {
    setPasteNotice(null);
    try {
      if (!navigator.clipboard?.readText) {
        setPasteNotice('Clipboard paste is unavailable in this browser. Long-press the input to paste.');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        onUrlInputChange(text.trim());
      } else {
        setPasteNotice('Your clipboard is empty. Copy a YouTube or Instagram link first.');
      }
    } catch {
      setPasteNotice('Tap and hold the link box to paste directly on Android.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInspect();
  };

  const filteredFormats = inspectedMedia
    ? inspectedMedia.formats.filter((f) => formatFilter === 'all' || f.kind === formatFilter)
    : [];

  const activeFormat =
    filteredFormats.find((f) => f.id === selectedFormatId) ||
    filteredFormats[0] ||
    inspectedMedia?.formats[0] ||
    null;

  return (
    <div className="space-y-6">
      {/* Top Input & Hero Workspace */}
      <section aria-labelledby="downloader-heading" className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className={inspectedMedia ? 'lg:col-span-12' : 'lg:col-span-7'}>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-1.5">
              <h1
                id="downloader-heading"
                className="font-display text-2xl font-bold tracking-tight text-slate-900 md:text-3xl dark:text-slate-100"
                style={{ textWrap: 'balance' }}
              >
                Save YouTube &amp; Instagram videos cleanly on Android
              </h1>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Paste any YouTube video, Shorts, or Instagram Reel link to inspect full MP4 resolutions, M4A audio tracks, and cover images.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-2.5" noValidate>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="media-url-input"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Video or Reel link
                </label>

                <div
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800"
                  role="group"
                  aria-label="Execution engine"
                >
                  <button
                    type="button"
                    onClick={() => onEngineModeChange('cloud')}
                    aria-pressed={engineMode === 'cloud'}
                    className={`min-h-[30px] rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      engineMode === 'cloud'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Cloud Engine
                  </button>
                  <button
                    type="button"
                    onClick={() => onEngineModeChange('android_local')}
                    aria-pressed={engineMode === 'android_local'}
                    className={`min-h-[30px] rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      engineMode === 'android_local'
                        ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    Android Local
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="flex h-12 flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-1.5 focus-within:border-blue-600 focus-within:bg-white dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-blue-500">
                  <Link2
                    className="h-4 w-4 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="media-url-input"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://youtu.be/... or https://instagram.com/reel/..."
                    value={urlInput}
                    onChange={(e) => onUrlInputChange(e.target.value)}
                    aria-invalid={inspectError ? 'true' : 'false'}
                    className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                  />

                  <div className="flex shrink-0 items-center gap-0.5">
                    {urlInput.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onUrlInputChange('')}
                        aria-label="Clear link"
                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handlePaste}
                      aria-label="Paste link from clipboard"
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/60 whitespace-nowrap shrink-0"
                    >
                      <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                      <span>Paste</span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isInspecting}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
                >
                  {isInspecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Inspecting</span>
                    </>
                  ) : (
                    <span>Fetch Media</span>
                  )}
                </button>
              </div>

              {pasteNotice && (
                <p className="text-xs text-slate-600 dark:text-slate-400">{pasteNotice}</p>
              )}

              {inspectError && (
                <div
                  role="alert"
                  className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-200"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    <span>{inspectError}</span>
                  </div>
                  {(inspectErrorCode === 'CLOUD_IP_BLOCKED' || inspectErrorCode === 'ENGINE_OFFLINE') && (
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <button
                        type="button"
                        onClick={() => {
                          onEngineModeChange('android_local');
                          onOpenAndroid();
                        }}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Setup Android On-Device Engine</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Quick Sample Presets */}
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Quick test:
              </span>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                {QUICK_SAMPLE_LINKS.map((sample) => (
                  <button
                    key={sample.url}
                    type="button"
                    onClick={() => {
                      onUrlInputChange(sample.url);
                      onInspect(sample.url);
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-blue-600 dark:hover:bg-blue-950/50 dark:hover:text-blue-300 whitespace-nowrap shrink-0"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column Summary on Desktop before Inspection */}
        {!inspectedMedia && !isInspecting && (
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Built for Android workflows
              </h2>
              <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-3">
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Run the Android Local Engine on your phone IP so all YouTube &amp; Instagram videos download without cloud restrictions.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Share straight from the YouTube or Instagram app into VeloSave once installed.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>One-handed thumb navigation with offline saved Library history.</span>
                </li>
              </ul>
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onOpenAndroid}
                  className="inline-flex min-h-[44px] items-center text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  Open Android Engine &amp; Install Guide →
                </button>
              </div>
            </div>

            {recentLibrary.length > 0 && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    Recently Saved
                  </h2>
                  <button
                    type="button"
                    onClick={onOpenLibrary}
                    className="min-h-[44px] px-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View all
                  </button>
                </div>
                <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                  {recentLibrary.slice(0, 2).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-2.5">
                      <MediaThumbnail
                        src={item.thumbnailUrl}
                        alt={item.title}
                        platform={item.platform}
                        className="h-12 w-20 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{item.platform === 'youtube' ? 'YouTube' : 'Instagram'}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{item.formatLabel}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono tabular-nums">{formatBytes(item.sizeBytes)}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Loading Skeleton */}
      {isInspecting && (
        <section
          aria-label="Loading media details"
          className="grid gap-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lg:grid-cols-12 md:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="aspect-video w-full animate-pulse rounded-xl bg-slate-200 lg:col-span-5 dark:bg-slate-800" />
          <div className="space-y-4 lg:col-span-7">
            <div className="h-6 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-2.5 pt-2">
              <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
              <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
            </div>
          </div>
        </section>
      )}

      {/* Inspected Media Result Card */}
      {inspectedMedia && !isInspecting && (
        <section
          aria-label="Inspected media formats"
          className="grid gap-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:grid-cols-12 lg:gap-7 md:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Left: Media Preview */}
          <div className="space-y-3 lg:col-span-5">
            <MediaThumbnail
              src={inspectedMedia.thumbnailUrl}
              alt={inspectedMedia.title}
              platform={inspectedMedia.platform}
              durationLabel={formatDuration(inspectedMedia.durationSeconds)}
              className="aspect-video w-full rounded-xl"
            />
            <div className="space-y-1.5">
              <h2
                className="font-display text-lg font-semibold leading-snug text-slate-900 md:text-xl dark:text-slate-100"
                style={{ textWrap: 'balance' }}
              >
                {inspectedMedia.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {inspectedMedia.platform === 'youtube' ? 'YouTube' : 'Instagram'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{inspectedMedia.author}</span>
                {inspectedMedia.durationSeconds > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatDuration(inspectedMedia.durationSeconds)}
                    </span>
                  </>
                )}
                {inspectedMedia.isDemo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Sample Preview</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right: Format Selection & Action */}
          <div className="flex flex-col justify-between space-y-4 lg:col-span-7">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Choose format
                </span>
                <div
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
                  role="tablist"
                  aria-label="Filter media formats"
                >
                  {(['all', 'video', 'audio', 'thumbnail'] as const).map((kind) => {
                    const active = formatFilter === kind;
                    const label =
                      kind === 'all'
                        ? 'All'
                        : kind === 'video'
                        ? 'Video'
                        : kind === 'audio'
                        ? 'Audio'
                        : 'Cover';
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setFormatFilter(kind);
                          const firstMatch = inspectedMedia.formats.find(
                            (f) => kind === 'all' || f.kind === kind
                          );
                          if (firstMatch) setSelectedFormatId(firstMatch.id);
                        }}
                        className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                {filteredFormats.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No formats available in this category for this link.
                  </p>
                ) : (
                  filteredFormats.map((fmt) => {
                    const isSelected = activeFormat?.id === fmt.id;
                    const Icon =
                      fmt.kind === 'audio'
                        ? Music
                        : fmt.kind === 'thumbnail'
                        ? ImageIcon
                        : Film;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedFormatId(fmt.id)}
                        aria-pressed={isSelected}
                        className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/35'
                            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {isSelected ? (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                              {fmt.quality} {fmt.container.toUpperCase()}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              <span>{fmt.label}</span>
                              {fmt.codec && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span>{fmt.codec}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <span className="font-mono text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap shrink-0 dark:text-slate-300">
                          {formatBytes(fmt.sizeBytes)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {activeFormat && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onStartDownload(inspectedMedia, activeFormat)}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <ArrowDownToLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Download {activeFormat.quality} {activeFormat.container.toUpperCase()}
                  </span>
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
