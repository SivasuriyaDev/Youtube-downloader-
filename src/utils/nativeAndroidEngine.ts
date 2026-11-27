import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { InspectedMedia } from '../types/media';

export interface NativeDownloadProgressEvent {
  taskId: string;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface NativeDownloadResult {
  filename: string;
  savedPath: string;
  sizeBytes: number;
}

interface VeloSaveEnginePlugin {
  health(): Promise<{ ok: boolean; engine: string; ffmpeg: boolean; ytdlpVersion: string }>;
  inspect(options: { url: string }): Promise<InspectedMedia>;
  download(options: {
    taskId: string;
    url?: string;
    query?: string;
    directUrl?: string;
    itag?: string;
    ext: string;
    filename: string;
  }): Promise<NativeDownloadResult>;
  cancelDownload(options: { taskId: string }): Promise<{ cancelled: boolean }>;
  consumePendingShareUrl(): Promise<{ url: string | null }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (event: NativeDownloadProgressEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'sharedUrlReceived',
    listenerFunc: (event: { url: string }) => void
  ): Promise<PluginListenerHandle>;
}

const VeloSaveEngine = registerPlugin<VeloSaveEnginePlugin>('VeloSaveEngine');

export function isNativeAndroidRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as { androidBridge?: unknown }).androidBridge) return true;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function checkNativeAndroidHealth(): Promise<{
  ok: boolean;
  engine: string;
  ffmpeg: boolean;
  ytdlpVersion: string;
}> {
  return VeloSaveEngine.health();
}

export async function inspectViaNativeAndroid(url: string): Promise<InspectedMedia> {
  return VeloSaveEngine.inspect({ url });
}

export async function downloadViaNativeAndroid(
  options: {
    taskId: string;
    url?: string;
    query?: string;
    directUrl?: string;
    itag?: string;
    ext: string;
    filename: string;
  },
  onProgress: (loadedBytes: number, totalBytes: number, progress: number) => void
): Promise<NativeDownloadResult> {
  let listenerHandle: PluginListenerHandle | null = null;
  try {
    listenerHandle = await VeloSaveEngine.addListener('downloadProgress', (ev) => {
      if (ev.taskId === options.taskId) {
        onProgress(ev.loadedBytes || 0, ev.totalBytes || 0, Math.min(100, Math.max(0, ev.progress || 0)));
      }
    });
    return await VeloSaveEngine.download(options);
  } finally {
    if (listenerHandle) {
      await listenerHandle.remove().catch(() => {});
    }
  }
}

export async function cancelNativeAndroidDownload(taskId: string): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  await VeloSaveEngine.cancelDownload({ taskId }).catch(() => {});
}

export async function consumeNativeSharedUrl(): Promise<string | null> {
  if (!isNativeAndroidRuntime()) return null;
  try {
    const res = await VeloSaveEngine.consumePendingShareUrl();
    return res.url || null;
  } catch {
    return null;
  }
}

export async function subscribeNativeSharedUrls(
  onUrl: (url: string) => void
): Promise<(() => void) | null> {
  if (!isNativeAndroidRuntime()) return null;
  try {
    const handle = await VeloSaveEngine.addListener('sharedUrlReceived', (ev) => {
      if (ev.url) onUrl(ev.url);
    });
    return () => {
      void handle.remove().catch(() => {});
    };
  } catch {
    return null;
  }
}
