import React, { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  Copy,
  FolderHeart,
  Search,
  Trash2,
} from 'lucide-react';
import type { LibraryItem, MediaPlatform } from '../types/media';
import { formatBytes, formatDuration } from '../utils/mediaParser';
import { MediaThumbnail } from './MediaThumbnail';

interface LibraryViewProps {
  items: LibraryItem[];
  onRedownload: (item: LibraryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onGoToDownloader: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  items,
  onRedownload,
  onDeleteItem,
  onClearAll,
  onGoToDownloader,
}) => {
  const [platformFilter, setPlatformFilter] = useState<'all' | MediaPlatform>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (platformFilter !== 'all' && item.platform !== platformFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.formatLabel.toLowerCase().includes(q)
      );
    });
  }, [items, platformFilter, searchQuery]);

  const handleCopyLink = async (item: LibraryItem) => {
    try {
      await navigator.clipboard.writeText(item.canonicalUrl);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <section aria-labelledby="library-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            id="library-heading"
            className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
          >
            Saved Library
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Offline history of your downloaded YouTube and Instagram media.
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setConfirmClear(false);
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Clear all</span>
              </button>
            )}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="inline-flex items-center gap-1 self-start rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800"
            role="tablist"
            aria-label="Filter library by platform"
          >
            {(['all', 'youtube', 'instagram'] as const).map((plat) => {
              const active = platformFilter === plat;
              const label =
                plat === 'all' ? 'All' : plat === 'youtube' ? 'YouTube' : 'Instagram';
              return (
                <button
                  key={plat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPlatformFilter(plat)}
                  className={`min-h-[38px] rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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

          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="library-search" className="sr-only">
              Search saved downloads
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="library-search"
              type="search"
              placeholder="Search saved titles or creators"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <FolderHeart className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            No saved downloads yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Completed downloads are remembered here so you can re-save or copy their links anytime.
          </p>
          <button
            type="button"
            onClick={onGoToDownloader}
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
            <span>Start Downloading</span>
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          No saved items match your current filter.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3.5">
                <MediaThumbnail
                  src={item.thumbnailUrl}
                  alt={item.title}
                  platform={item.platform}
                  durationLabel={formatDuration(item.durationSeconds)}
                  className="h-16 w-24 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{item.platform === 'youtube' ? 'YouTube' : 'Instagram'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{item.author}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {item.formatLabel} {item.container.toUpperCase()}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatBytes(item.sizeBytes)}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyLink(item)}
                  aria-label={`Copy link for ${item.title}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  {copiedId === item.id ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onRedownload(item)}
                  aria-label={`Re-download ${item.title}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  aria-label={`Delete ${item.title}`}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
