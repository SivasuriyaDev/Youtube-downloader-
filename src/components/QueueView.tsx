import React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  ListChecks,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import type { DownloadTask } from '../types/media';
import { formatBytes } from '../utils/mediaParser';
import { MediaThumbnail } from './MediaThumbnail';

interface QueueViewProps {
  tasks: DownloadTask[];
  onCancelTask: (taskId: string) => void;
  onRetryTask: (task: DownloadTask) => void;
  onRemoveTask: (taskId: string) => void;
  onClearFinished: () => void;
  onGoToDownloader: () => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  tasks,
  onCancelTask,
  onRetryTask,
  onRemoveTask,
  onClearFinished,
  onGoToDownloader,
}) => {
  const hasFinished = tasks.some((t) => t.status !== 'downloading');

  return (
    <section aria-labelledby="queue-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1
            id="queue-heading"
            className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
          >
            Download Queue
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track active transfers and save completed files directly to your device.
          </p>
        </div>

        {hasFinished && (
          <button
            type="button"
            onClick={onClearFinished}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>Clear finished</span>
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <ListChecks className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Your queue is empty
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Fetch any YouTube or Instagram link and pick a format to begin saving media.
          </p>
          <button
            type="button"
            onClick={onGoToDownloader}
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
            <span>Go to Downloader</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {tasks.map((task) => {
            const statusText =
              task.status === 'downloading'
                ? 'Downloading'
                : task.status === 'completed'
                ? 'Saved to device'
                : task.status === 'cancelled'
                ? 'Cancelled'
                : 'Failed';

            return (
              <div
                key={task.taskId}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3.5">
                  <MediaThumbnail
                    src={task.thumbnailUrl}
                    alt={task.title}
                    platform={task.platform}
                    className="h-16 w-24 shrink-0 rounded-xl"
                  />

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {task.title}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {task.platform === 'spotify'
                          ? 'Spotify'
                          : task.platform === 'youtube'
                          ? 'YouTube'
                          : 'Instagram'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {task.format.quality} {task.format.container.toUpperCase()}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {task.totalBytes > 0
                          ? `${formatBytes(task.loadedBytes)} / ${formatBytes(task.totalBytes)}`
                          : formatBytes(task.loadedBytes)}
                      </span>
                    </p>

                    {task.status === 'downloading' ? (
                      <div className="flex items-center gap-3 pt-0.5">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-[width] duration-150 dark:bg-blue-500"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-medium text-slate-700 tabular-nums dark:text-slate-300">
                          {task.progress}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {task.status === 'completed' ? (
                          <>
                            <CheckCircle2
                              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                            <span className="text-emerald-700 dark:text-emerald-300">
                              {statusText}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle
                              className="h-4 w-4 text-rose-600 dark:text-rose-400"
                              aria-hidden="true"
                            />
                            <span className="text-rose-700 dark:text-rose-300">
                              {task.errorMessage || statusText}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0">
                  {task.status === 'downloading' ? (
                    <button
                      type="button"
                      onClick={() => onCancelTask(task.taskId)}
                      aria-label={`Cancel ${task.title}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span>Cancel</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onRetryTask(task)}
                        aria-label={
                          task.status === 'completed'
                            ? `Download ${task.title} again`
                            : `Retry ${task.title}`
                        }
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
                      >
                        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{task.status === 'completed' ? 'Save Again' : 'Retry'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTask(task.taskId)}
                        aria-label={`Remove ${task.title} from queue`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
