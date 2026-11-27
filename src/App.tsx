import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { OfflineBanner } from './components/OfflineBanner';
import { DownloaderView } from './components/DownloaderView';
import { QueueView } from './components/QueueView';
import { LibraryView } from './components/LibraryView';
import { AndroidSetupView } from './components/AndroidSetupView';
import { useTheme } from './hooks/useTheme';
import { SAMPLE_PRESETS } from './data/sampleMedia';
import {
  buildDownloadEndpoint,
  loadLibraryItems,
  saveLibraryItems,
  streamAndSaveFile,
} from './utils/downloadManager';
import {
  loadEngineSettings,
  resolveApiBaseUrl,
  saveEngineSettings,
  type EngineSettings,
  type ExecutionEngineMode,
} from './utils/engineConfig';
import { extractSharedUrl, parseMediaUrl, sanitizeFilename } from './utils/mediaParser';
import type {
  ActiveTab,
  DownloadTask,
  InspectedMedia,
  LibraryItem,
  MediaFormat,
} from './types/media';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>('downloader');
  const [urlInput, setUrlInput] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectErrorCode, setInspectErrorCode] = useState<string | null>(null);
  const [inspectedMedia, setInspectedMedia] = useState<InspectedMedia | null>(null);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>(() => loadLibraryItems());
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(() => loadEngineSettings());

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const apiBaseUrl = resolveApiBaseUrl(engineSettings);

  const handleUpdateEngineSettings = useCallback((next: EngineSettings) => {
    setEngineSettings(next);
    saveEngineSettings(next);
    setInspectError(null);
    setInspectErrorCode(null);
  }, []);

  const handleEngineModeChange = useCallback(
    (mode: ExecutionEngineMode) => {
      handleUpdateEngineSettings({ ...engineSettings, mode });
    },
    [engineSettings, handleUpdateEngineSettings]
  );

  const handleInspect = useCallback(
    async (overrideUrl?: string) => {
      const candidate = (overrideUrl ?? urlInput).trim();
      const parsed = parseMediaUrl(candidate);

      if (!parsed.valid || !parsed.canonicalUrl) {
        setInspectError(parsed.error || 'Please enter a valid YouTube or Instagram link.');
        setInspectErrorCode(null);
        return;
      }

      setInspectError(null);
      setInspectErrorCode(null);
      setIsInspecting(true);

      const demoMatch = SAMPLE_PRESETS[parsed.canonicalUrl];
      if (demoMatch) {
        await new Promise((r) => setTimeout(r, 220));
        setInspectedMedia(demoMatch);
        setIsInspecting(false);
        return;
      }

      if (engineSettings.mode === 'custom' && !apiBaseUrl) {
        setInspectError('Enter a valid Custom Engine URL in Android Setup before fetching.');
        setInspectErrorCode('ENGINE_OFFLINE');
        setIsInspecting(false);
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: parsed.canonicalUrl }),
        });

        const data = (await response.json()) as InspectedMedia & { error?: string; code?: string };
        if (!response.ok) {
          setInspectError(data.error || 'Could not inspect this link. Verify it is public and try again.');
          setInspectErrorCode(data.code || null);
          setInspectedMedia(null);
        } else {
          setInspectedMedia(data);
        }
      } catch {
        setInspectError(
          engineSettings.mode === 'android_local'
            ? 'Android Local Engine (127.0.0.1:3847) is not running yet. Start Termux using the setup command in Android Setup.'
            : 'Network error while inspecting the link. Check your connection and try again.'
        );
        setInspectErrorCode(engineSettings.mode === 'android_local' ? 'ENGINE_OFFLINE' : null);
        setInspectedMedia(null);
      } finally {
        setIsInspecting(false);
      }
    },
    [apiBaseUrl, engineSettings.mode, urlInput]
  );

  useEffect(() => {
    const shared = extractSharedUrl(window.location.search);
    if (shared) {
      setUrlInput(shared);
      window.history.replaceState({}, '', window.location.pathname);
      void handleInspect(shared);
    }
  }, [handleInspect]);

  const executeTask = useCallback(
    async (task: DownloadTask, contentType: InspectedMedia['contentType'], durationSeconds: number) => {
      const controller = new AbortController();
      abortControllersRef.current.set(task.taskId, controller);

      const { endpoint, filename } = buildDownloadEndpoint(
        { canonicalUrl: task.canonicalUrl, title: task.title },
        task.format,
        apiBaseUrl
      );

      try {
        const finalBytes = await streamAndSaveFile(
          endpoint,
          filename,
          task.format.sizeBytes,
          controller.signal,
          (loadedBytes, totalBytes, progress) => {
            setTasks((prev) =>
              prev.map((t) =>
                t.taskId === task.taskId
                  ? { ...t, loadedBytes, totalBytes, progress }
                  : t
              )
            );
          }
        );

        setTasks((prev) =>
          prev.map((t) =>
            t.taskId === task.taskId
              ? {
                  ...t,
                  status: 'completed',
                  progress: 100,
                  loadedBytes: finalBytes,
                  totalBytes: finalBytes,
                }
              : t
          )
        );

        const newLibItem: LibraryItem = {
          id: `${task.mediaId}-${task.format.id}-${Date.now()}`,
          mediaId: task.mediaId,
          platform: task.platform,
          contentType,
          title: task.title,
          author: task.author,
          durationSeconds,
          thumbnailUrl: task.thumbnailUrl,
          canonicalUrl: task.canonicalUrl,
          formatLabel: task.format.quality,
          container: task.format.container,
          sizeBytes: finalBytes,
          filename,
          savedAt: Date.now(),
          sampleKey: task.format.sampleKey,
          itag: task.format.itag,
          directUrl: task.format.directUrl,
        };

        setLibraryItems((prev) => {
          const next = [
            newLibItem,
            ...prev.filter(
              (i) =>
                !(
                  i.mediaId === newLibItem.mediaId &&
                  i.formatLabel === newLibItem.formatLabel &&
                  i.container === newLibItem.container
                )
            ),
          ].slice(0, 50);
          saveLibraryItems(next);
          return next;
        });
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        const errorMessage = err instanceof Error ? err.message : 'Download interrupted.';
        setTasks((prev) =>
          prev.map((t) =>
            t.taskId === task.taskId
              ? {
                  ...t,
                  status: isAbort ? 'cancelled' : 'failed',
                  errorMessage: isAbort ? 'Cancelled' : errorMessage,
                }
              : t
          )
        );
      } finally {
        abortControllersRef.current.delete(task.taskId);
      }
    },
    [apiBaseUrl]
  );

  const handleStartDownload = (media: InspectedMedia, format: MediaFormat) => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const filename = sanitizeFilename(media.title, format.container);
    const newTask: DownloadTask = {
      taskId,
      mediaId: media.id,
      platform: media.platform,
      title: media.title,
      author: media.author,
      thumbnailUrl: media.thumbnailUrl,
      canonicalUrl: media.canonicalUrl,
      format,
      status: 'downloading',
      progress: 0,
      loadedBytes: 0,
      totalBytes: format.sizeBytes || 0,
      filename,
      createdAt: Date.now(),
    };

    setTasks((prev) => [newTask, ...prev]);
    setActiveTab('queue');
    void executeTask(newTask, media.contentType, media.durationSeconds);
  };

  const handleCancelTask = (taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
    }
  };

  const handleRetryTask = (task: DownloadTask) => {
    const retried: DownloadTask = {
      ...task,
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'downloading',
      progress: 0,
      loadedBytes: 0,
      errorMessage: undefined,
      createdAt: Date.now(),
    };
    setTasks((prev) => [retried, ...prev.filter((t) => t.taskId !== task.taskId)]);
    void executeTask(retried, 'video', 0);
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
  };

  const handleClearFinished = () => {
    setTasks((prev) => prev.filter((t) => t.status === 'downloading'));
  };

  const handleRedownloadFromLibrary = (item: LibraryItem) => {
    const format: MediaFormat = {
      id: `${item.formatLabel}-${item.container}`,
      kind:
        item.container === 'm4a' || item.container === 'webm'
          ? 'audio'
          : item.container === 'jpg'
          ? 'thumbnail'
          : 'video',
      label: item.formatLabel,
      quality: item.formatLabel,
      container: (item.container as MediaFormat['container']) || 'mp4',
      sizeBytes: item.sizeBytes,
      hasAudio: item.container !== 'jpg',
      hasVideo: item.container === 'mp4',
      sampleKey: item.sampleKey,
      itag: item.itag,
      directUrl: item.directUrl,
    };

    const task: DownloadTask = {
      taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      mediaId: item.mediaId,
      platform: item.platform,
      title: item.title,
      author: item.author,
      thumbnailUrl: item.thumbnailUrl,
      canonicalUrl: item.canonicalUrl,
      format,
      status: 'downloading',
      progress: 0,
      loadedBytes: 0,
      totalBytes: item.sizeBytes,
      filename: item.filename,
      createdAt: Date.now(),
    };

    setTasks((prev) => [task, ...prev]);
    setActiveTab('queue');
    void executeTask(task, item.contentType, item.durationSeconds);
  };

  const handleDeleteLibraryItem = (id: string) => {
    setLibraryItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveLibraryItems(next);
      return next;
    });
  };

  const handleClearLibrary = () => {
    setLibraryItems([]);
    saveLibraryItems([]);
  };

  const handleTestShareLink = (sharedUrl: string) => {
    setUrlInput(sharedUrl);
    setActiveTab('downloader');
    void handleInspect(sharedUrl);
  };

  const activeQueueCount = tasks.filter((t) => t.status === 'downloading').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeQueueCount={activeQueueCount}
        libraryCount={libraryItems.length}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:pb-14 md:pt-8">
        {activeTab === 'downloader' && (
          <DownloaderView
            urlInput={urlInput}
            onUrlInputChange={(val) => {
              setUrlInput(val);
              if (inspectError) {
                setInspectError(null);
                setInspectErrorCode(null);
              }
            }}
            isInspecting={isInspecting}
            inspectError={inspectError}
            inspectErrorCode={inspectErrorCode}
            inspectedMedia={inspectedMedia}
            onInspect={handleInspect}
            onStartDownload={handleStartDownload}
            recentLibrary={libraryItems}
            engineMode={engineSettings.mode}
            onEngineModeChange={handleEngineModeChange}
            onOpenLibrary={() => setActiveTab('library')}
            onOpenAndroid={() => setActiveTab('android')}
          />
        )}

        {activeTab === 'queue' && (
          <QueueView
            tasks={tasks}
            onCancelTask={handleCancelTask}
            onRetryTask={handleRetryTask}
            onRemoveTask={handleRemoveTask}
            onClearFinished={handleClearFinished}
            onGoToDownloader={() => setActiveTab('downloader')}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            items={libraryItems}
            onRedownload={handleRedownloadFromLibrary}
            onDeleteItem={handleDeleteLibraryItem}
            onClearAll={handleClearLibrary}
            onGoToDownloader={() => setActiveTab('downloader')}
          />
        )}

        {activeTab === 'android' && (
          <AndroidSetupView
            engineSettings={engineSettings}
            onUpdateEngineSettings={handleUpdateEngineSettings}
            onTestShareLink={handleTestShareLink}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeQueueCount={activeQueueCount}
      />

      <OfflineBanner />
    </div>
  );
}
