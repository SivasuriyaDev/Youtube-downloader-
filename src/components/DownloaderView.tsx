import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ClipboardPaste,
  Cpu,
  Film,
  Image as ImageIcon,
  Link2,
  ListMusic,
  Loader2,
  Music,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import type {
  FormatKind,
  InspectedMedia,
  LibraryItem,
  MediaFormat,
  PlaylistTrackItem,
} from '../types/media';
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
  onStartPlaylistDownload: (
    playlist: InspectedMedia,
    tracks: PlaylistTrackItem[],
    format: MediaFormat
  ) => void;
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
  onStartPlaylistDownload,
  recentLibrary,
  engineMode,
  onEngineModeChange,
  onOpenLibrary,
  onOpenAndroid,
}) => {
  const [formatFilter, setFormatFilter] = useState<'all' | FormatKind>('all');
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  useEffect(() => {
    if (inspectedMedia && inspectedMedia.formats.length > 0) {
      setFormatFilter('all');
      if (inspectedMedia.platform === 'spotify') {
        const audioFirst = inspectedMedia.formats.find((f) => f.kind === 'audio');
        setSelectedFormatId(audioFirst?.id || inspectedMedia.formats[0].id);
      } else {
        setSelectedFormatId(inspectedMedia.formats[0].id);
      }
      if (inspectedMedia.tracks && inspectedMedia.tracks.length > 0) {
        setSelectedTrackIds(new Set(inspectedMedia.tracks.map((t) => t.id)));
      } else {
        setSelectedTrackIds(new Set());
      }
    } else {
      setSelectedFormatId(null);
      setSelectedTrackIds(new Set());
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
        setPasteNotice('Your clipboard is empty. Copy a YouTube, Instagram, or Spotify link first.');
      }
    } catch {
      setPasteNotice('Tap and hold the link box to paste directly on Android.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onInspect();
  };

  const isPlaylistView = Boolean(inspectedMedia?.tracks && inspectedMedia.tracks.length > 0);

  const filteredFormats = inspectedMedia
    ? inspectedMedia.formats.filter((f) => formatFilter === 'all' || f.kind === formatFilter)
    : [];

  const activeFormat =
    filteredFormats.find((f) => f.id === selectedFormatId) ||
    filteredFormats[0] ||
    inspectedMedia?.formats[0] ||
    null;

  const selectedTracks = useMemo(() => {
    if (!inspectedMedia?.tracks) return [];
    return inspectedMedia.tracks.filter((t) => selectedTrackIds.has(t.id));
  }, [inspectedMedia, selectedTrackIds]);

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const toggleSelectAllTracks = () => {
    if (!inspectedMedia?.tracks) return;
    if (selectedTrackIds.size === inspectedMedia.tracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(inspectedMedia.tracks.map((t) => t.id)));
    }
  };

  const handleSingleTrackDownload = (track: PlaylistTrackItem) => {
    if (!inspectedMedia || !activeFormat) return;
    onStartPlaylistDownload(inspectedMedia, [track], activeFormat);
  };

  const formatPlatformLabel = (platform: InspectedMedia['platform']) =>
    platform === 'spotify' ? 'Spotify' : platform === 'youtube' ? 'YouTube' : 'Instagram';

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
                Save YouTube, Instagram &amp; Spotify media on Android
              </h1>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Paste any YouTube video or playlist, Instagram Reel, or Spotify playlist link to download MP4 video, MP3/M4A audio, or cover images.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-2.5" noValidate>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="media-url-input"
                  className="text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  Video, Reel, or Playlist link
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
                  <Link2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <input
                    id="media-url-input"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="YouTube video/playlist, Instagram Reel, or Spotify playlist URL"
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
                  <ListMusic className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Batch download entire YouTube playlists &amp; Spotify playlists/albums as MP3, M4A, or MP4.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Run the Android Local Engine on your phone IP so videos &amp; playlists download without cloud restrictions.</span>
                </li>
                <li className="flex items-start gap-3">
                  <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>Share straight from YouTube, Instagram, or Spotify into VeloSave once installed.</span>
                </li>
              </ul>
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={onOpenAndroid}
                  className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open Android Engine &amp; Install Guide →</span>
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
                          <span>{formatPlatformLabel(item.platform)}</span>
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

      {/* Playlist / Album Result View */}
      {inspectedMedia && !isInspecting && isPlaylistView && inspectedMedia.tracks && (
        <section
          aria-label="Playlist tracks and batch download"
          className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Playlist Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <MediaThumbnail
                src={inspectedMedia.thumbnailUrl}
                alt={inspectedMedia.title}
                platform={inspectedMedia.platform}
                className="h-20 w-24 shrink-0 rounded-xl sm:h-24 sm:w-32"
              />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <span className="whitespace-nowrap">
                    {formatPlatformLabel(inspectedMedia.platform)}{' '}
                    {inspectedMedia.contentType === 'album' ? 'Album' : 'Playlist'}
                  </span>
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    · {inspectedMedia.tracks.length} tracks
                  </span>
                  {inspectedMedia.durationSeconds > 0 && (
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      · {formatDuration(inspectedMedia.durationSeconds)}
                    </span>
                  )}
                </div>
                <h2 className="font-display truncate text-lg font-bold text-slate-900 md:text-xl dark:text-slate-100">
                  {inspectedMedia.title}
                </h2>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {inspectedMedia.author}
                  {inspectedMedia.isDemo ? ' · Sample Preview' : ''}
                </p>
              </div>
            </div>

            {activeFormat && (
              <button
                type="button"
                disabled={selectedTracks.length === 0}
                onClick={() => onStartPlaylistDownload(inspectedMedia, selectedTracks, activeFormat)}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <ArrowDownToLine className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Download Selected ({selectedTracks.length}) · {activeFormat.container.toUpperCase()}
                </span>
              </button>
            )}
          </div>

          {/* Format Selector for Batch */}
          <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Output format for all selected tracks
              </span>
              <button
                type="button"
                onClick={toggleSelectAllTracks}
                className="min-h-[36px] rounded-lg px-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50"
              >
                {selectedTrackIds.size === inspectedMedia.tracks.length
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {inspectedMedia.formats.map((fmt) => {
                const isSelected = activeFormat?.id === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormatId(fmt.id)}
                    aria-pressed={isSelected}
                    className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'
                    }`}
                  >
                    {fmt.kind === 'audio' ? (
                      <Music className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Film className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="whitespace-nowrap">
                      {fmt.quality} {fmt.container.toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Track List */}
          <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
            {inspectedMedia.tracks.map((track) => {
              const checked = selectedTrackIds.has(track.id);
              return (
                <div
                  key={track.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTrackSelection(track.id)}
                      aria-label={`Select ${track.title}`}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="w-6 shrink-0 font-mono text-xs text-slate-400 tabular-nums">
                      {String(track.index).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        <span>{track.author}</span>
                        {track.durationSeconds > 0 && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono tabular-nums">
                              {formatDuration(track.durationSeconds)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleSingleTrackDownload(track)}
                    aria-label={`Save ${track.title}`}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 shrink-0"
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Save</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Single Media Result Card */}
      {inspectedMedia && !isInspecting && !isPlaylistView && (
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
                  {formatPlatformLabel(inspectedMedia.platform)}
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
              {inspectedMedia.playlistUrl && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onUrlInputChange(inspectedMedia.playlistUrl!);
                      onInspect(inspectedMedia.playlistUrl!);
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300"
                  >
                    <ListMusic className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Load Full Playlist</span>
                  </button>
                </div>
              )}
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
