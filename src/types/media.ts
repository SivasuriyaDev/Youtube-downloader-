export type MediaPlatform = 'youtube' | 'instagram' | 'spotify';

export type MediaContentType =
  | 'video'
  | 'short'
  | 'reel'
  | 'post'
  | 'playlist'
  | 'album'
  | 'track';

export type FormatKind = 'video' | 'audio' | 'thumbnail';

export interface MediaFormat {
  id: string;
  kind: FormatKind;
  label: string;
  quality: string;
  container: 'mp4' | 'm4a' | 'mp3' | 'webm' | 'jpg';
  codec?: string;
  sizeBytes?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  itag?: number | string;
  sampleKey?: 'yt-demo' | 'ig-demo';
  directUrl?: string;
  searchQuery?: string;
}

export interface PlaylistTrackItem {
  id: string;
  index: number;
  platform: MediaPlatform;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  canonicalUrl: string;
  searchQuery?: string;
  sampleKey?: 'yt-demo' | 'ig-demo';
}

export interface InspectedMedia {
  id: string;
  platform: MediaPlatform;
  contentType: MediaContentType;
  canonicalUrl: string;
  playlistUrl?: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  isDemo?: boolean;
  formats: MediaFormat[];
  tracks?: PlaylistTrackItem[];
}

export type DownloadStatus = 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface DownloadTask {
  taskId: string;
  mediaId: string;
  platform: MediaPlatform;
  title: string;
  author: string;
  thumbnailUrl: string;
  canonicalUrl: string;
  searchQuery?: string;
  format: MediaFormat;
  status: DownloadStatus;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  filename: string;
  errorMessage?: string;
  createdAt: number;
}

export interface LibraryItem {
  id: string;
  mediaId: string;
  platform: MediaPlatform;
  contentType: MediaContentType;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnailUrl: string;
  canonicalUrl: string;
  searchQuery?: string;
  formatLabel: string;
  container: string;
  sizeBytes: number;
  filename: string;
  savedAt: number;
  sampleKey?: 'yt-demo' | 'ig-demo';
  itag?: number | string;
  directUrl?: string;
}

export type ActiveTab = 'downloader' | 'queue' | 'library' | 'android';
