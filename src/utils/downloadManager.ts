import type { InspectedMedia, LibraryItem, MediaFormat } from '../types/media';
import { sanitizeFilename } from './mediaParser';

const LIBRARY_STORAGE_KEY = 'velosave_library_v1';

export function loadLibraryItems(): LibraryItem[] {
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLibraryItems(items: LibraryItem[]): void {
  try {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildDownloadEndpoint(
  media: Pick<InspectedMedia, 'canonicalUrl' | 'title'> & { searchQuery?: string },
  format: MediaFormat,
  apiBaseUrl = ''
): { endpoint: string; filename: string } {
  const filename = sanitizeFilename(media.title, format.container);
  const base = apiBaseUrl.replace(/\/+$/, '');

  if (format.kind === 'thumbnail' && format.directUrl) {
    if (format.directUrl.startsWith('/')) {
      return { endpoint: format.directUrl, filename };
    }
    const params = new URLSearchParams({
      directUrl: format.directUrl,
      ext: format.container,
      filename,
    });
    return { endpoint: `${base}/api/download?${params.toString()}`, filename };
  }

  if (format.sampleKey) {
    const params = new URLSearchParams({
      sampleKey: format.sampleKey,
      kind: format.kind === 'audio' ? 'audio' : 'video',
      ext: format.container,
      filename,
    });
    return { endpoint: `/api/sample-asset?${params.toString()}`, filename };
  }

  if (format.directUrl) {
    const params = new URLSearchParams({
      directUrl: format.directUrl,
      ext: format.container,
      filename,
    });
    return { endpoint: `${base}/api/download?${params.toString()}`, filename };
  }

  const effectiveQuery = media.searchQuery || format.searchQuery;
  const params = new URLSearchParams({
    itag: String(format.itag || 'bestvideo+bestaudio/best'),
    ext: format.container,
    filename,
  });
  if (effectiveQuery) {
    params.set('query', effectiveQuery);
  } else {
    params.set('url', media.canonicalUrl);
  }
  return { endpoint: `${base}/api/download?${params.toString()}`, filename };
}

export async function streamAndSaveFile(
  endpoint: string,
  filename: string,
  expectedTotalBytes: number | undefined,
  signal: AbortSignal,
  onProgress: (loadedBytes: number, totalBytes: number, progress: number) => void
): Promise<number> {
  const response = await fetch(endpoint, { signal });
  if (!response.ok) {
    let message = 'Download failed on engine.';
    try {
      const json = (await response.json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      // Ignore parse error
    }
    throw new Error(message);
  }

  const headerLength = Number(response.headers.get('content-length') || 0);
  const totalBytes = headerLength > 0 ? headerLength : expectedTotalBytes || 0;

  if (!response.body) {
    const blob = await response.blob();
    triggerBrowserSave(blob, filename);
    onProgress(blob.size, blob.size, 100);
    return blob.size;
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value.slice());
      loadedBytes += value.byteLength;
      const pct = totalBytes > 0
        ? Math.min(99, Math.round((loadedBytes / totalBytes) * 100))
        : Math.min(90, Math.round(loadedBytes / 16384));
      onProgress(loadedBytes, totalBytes || loadedBytes, pct);
    }
  }

  const blob = new Blob(chunks);
  triggerBrowserSave(blob, filename);
  onProgress(blob.size, blob.size, 100);
  return blob.size;
}

export function triggerBrowserSave(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}
