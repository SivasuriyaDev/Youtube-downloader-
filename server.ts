import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isBlockedHost,
  parseMediaUrl,
  sanitizeFilename,
} from './src/utils/mediaParser.ts';
import type { InspectedMedia, MediaFormat, MediaPlatform, PlaylistTrackItem } from './src/types/media.ts';

dotenv.config();

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const YT_DLP_CACHE_PATH = path.join(os.tmpdir(), 'velosave-yt-dlp');
const ALLOWED_MEDIA_CDN_SUFFIXES = [
  '.ytimg.com',
  '.youtube.com',
  '.googlevideo.com',
  '.cdninstagram.com',
  '.fbcdn.net',
  '.scdn.co',
  '.spotifycdn.com',
];

function isAllowedCdnUrl(rawUrl: string): URL | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase();
    if (isBlockedHost(host)) return null;
    const matched = ALLOWED_MEDIA_CDN_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
    );
    return matched ? u : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureYtDlpBinary(): Promise<string> {
  for (const candidate of ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', '/tmp/yt-dlp', YT_DLP_CACHE_PATH]) {
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try next path
    }
  }

  const res = await fetchWithTimeout(
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
    { headers: { 'User-Agent': 'VeloSave/1.0' } },
    20000
  );
  if (!res.ok) {
    throw new Error('Could not initialize yt-dlp engine on server.');
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(YT_DLP_CACHE_PATH, bytes, { mode: 0o755 });
  return YT_DLP_CACHE_PATH;
}

function buildYtDlpEnvArgs(): string[] {
  const extra: string[] = ['--no-warnings', '--no-playlist', '--js-runtimes', 'node'];
  const proxy = process.env.YTDLP_PROXY?.trim();
  const cookiesPath = process.env.YT_COOKIES_PATH?.trim();

  if (proxy && (proxy.startsWith('http://') || proxy.startsWith('https://') || proxy.startsWith('socks5://'))) {
    extra.push('--proxy', proxy);
  }
  if (cookiesPath && fs.existsSync(cookiesPath)) {
    extra.push('--cookies', cookiesPath);
  }
  return extra;
}

interface YtDlpFormat {
  vcodec?: string;
  acodec?: string;
  height?: number;
  filesize?: number;
  filesize_approx?: number;
}

interface YtDlpInfo {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  formats?: YtDlpFormat[];
}

function mapYtDlpInfo(
  info: YtDlpInfo,
  platform: MediaPlatform,
  contentType: InspectedMedia['contentType'],
  canonicalUrl: string
): InspectedMedia {
  const rawFormats = Array.isArray(info.formats) ? info.formats : [];
  const formats: MediaFormat[] = [];
  const seenHeights = new Set<number>();

  const videoCandidates = rawFormats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && typeof f.height === 'number' && f.height > 0)
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  for (const f of videoCandidates) {
    const h = Number(f.height);
    if (![2160, 1440, 1080, 720, 480, 360].includes(h) && seenHeights.size >= 4) continue;
    if (seenHeights.has(h)) continue;
    seenHeights.add(h);
    formats.push({
      id: `v-${h}p`,
      kind: 'video',
      label: h >= 1080 ? 'Full HD Video' : h >= 720 ? 'HD Video' : 'Standard Video',
      quality: `${h}p`,
      container: 'mp4',
      codec: 'H.264 + AAC',
      sizeBytes: f.filesize || f.filesize_approx || undefined,
      hasAudio: true,
      hasVideo: true,
      itag: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`,
    });
    if (seenHeights.size >= 5) break;
  }

  if (formats.length === 0) {
    formats.push({
      id: 'v-best',
      kind: 'video',
      label: 'Best Available Video',
      quality: 'HD',
      container: 'mp4',
      codec: 'H.264 + AAC',
      hasAudio: true,
      hasVideo: true,
      itag: 'bestvideo+bestaudio/best',
    });
  }

  formats.push(
    {
      id: 'a-mp3',
      kind: 'audio',
      label: 'MP3 Audio Track',
      quality: '320 kbps',
      container: 'mp3',
      codec: 'MP3',
      hasAudio: true,
      hasVideo: false,
      itag: 'bestaudio',
    },
    {
      id: 'a-m4a',
      kind: 'audio',
      label: 'Audio Track',
      quality: '192 kbps',
      container: 'm4a',
      codec: 'AAC',
      hasAudio: true,
      hasVideo: false,
      itag: 'bestaudio',
    }
  );

  if (info.thumbnail) {
    const proxied = isAllowedCdnUrl(info.thumbnail)
      ? `/api/thumbnail-proxy?url=${encodeURIComponent(info.thumbnail)}`
      : info.thumbnail;
    formats.push({
      id: 'thumb-jpg',
      kind: 'thumbnail',
      label: 'Cover Image',
      quality: 'Original',
      container: 'jpg',
      codec: 'JPEG',
      hasAudio: false,
      hasVideo: false,
      directUrl: info.thumbnail,
    });
    return {
      id: String(info.id || Date.now()),
      platform,
      contentType,
      canonicalUrl,
      title: info.title || 'Media Video',
      author: info.uploader || info.channel || (platform === 'instagram' ? '@instagram' : 'YouTube Creator'),
      durationSeconds: Number(info.duration || 0),
      thumbnailUrl: proxied,
      formats,
    };
  }

  return {
    id: String(info.id || Date.now()),
    platform,
    contentType,
    canonicalUrl,
    title: info.title || 'Media Video',
    author: info.uploader || info.channel || (platform === 'instagram' ? '@instagram' : 'YouTube Creator'),
    durationSeconds: Number(info.duration || 0),
    thumbnailUrl: '',
    formats,
  };
}

function buildPlaylistFormats(includeVideo = true): MediaFormat[] {
  const formats: MediaFormat[] = [
    {
      id: 'pl-mp3',
      kind: 'audio',
      label: 'MP3 Audio Track',
      quality: '320 kbps',
      container: 'mp3',
      codec: 'MP3',
      hasAudio: true,
      hasVideo: false,
      itag: 'bestaudio',
    },
    {
      id: 'pl-m4a',
      kind: 'audio',
      label: 'M4A Audio Track',
      quality: '192 kbps',
      container: 'm4a',
      codec: 'AAC',
      hasAudio: true,
      hasVideo: false,
      itag: 'bestaudio',
    },
  ];
  if (includeVideo) {
    formats.unshift(
      {
        id: 'pl-1080',
        kind: 'video',
        label: 'Full HD Video',
        quality: '1080p',
        container: 'mp4',
        codec: 'H.264 + AAC',
        hasAudio: true,
        hasVideo: true,
        itag: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      },
      {
        id: 'pl-720',
        kind: 'video',
        label: 'HD Video',
        quality: '720p',
        container: 'mp4',
        codec: 'H.264 + AAC',
        hasAudio: true,
        hasVideo: true,
        itag: 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      },
      {
        id: 'pl-360',
        kind: 'video',
        label: 'Data Saver Video',
        quality: '360p',
        container: 'mp4',
        codec: 'H.264 + AAC',
        hasAudio: true,
        hasVideo: true,
        itag: 'bestvideo[height<=360]+bestaudio/best[height<=360]',
      }
    );
  }
  return formats;
}

interface SpotifyEmbedEntity {
  type?: 'playlist' | 'album' | 'track';
  name?: string;
  subtitle?: string;
  duration?: number;
  artists?: { name?: string }[];
  coverArt?: { sources?: { url?: string }[] };
  visualIdentity?: { image?: { url?: string }[] };
  trackList?: {
    uri?: string;
    uid?: string;
    title?: string;
    subtitle?: string;
    duration?: number;
  }[];
}

async function inspectSpotifyPublicMetadata(
  canonicalUrl: string,
  contentType: 'playlist' | 'album' | 'track',
  id: string
): Promise<InspectedMedia> {
  const embedUrl = `https://open.spotify.com/embed/${contentType}/${id}`;
  const res = await fetchWithTimeout(
    embedUrl,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      },
    },
    12000
  );

  if (!res.ok) {
    throw new Error('Could not load this Spotify link. Make sure the playlist or track is public.');
  }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Could not parse public Spotify playlist metadata.');
  }

  const nextData = JSON.parse(match[1]) as {
    props?: { pageProps?: { state?: { data?: { entity?: SpotifyEmbedEntity } } } };
  };
  const entity = nextData?.props?.pageProps?.state?.data?.entity;
  if (!entity || !entity.name) {
    throw new Error('Spotify item appears private or unavailable.');
  }

  const rawCover =
    entity.coverArt?.sources?.[0]?.url ||
    entity.visualIdentity?.image?.[0]?.url ||
    '';
  const coverThumb = rawCover && isAllowedCdnUrl(rawCover)
    ? `/api/thumbnail-proxy?url=${encodeURIComponent(rawCover)}`
    : rawCover;

  if (contentType === 'track') {
    const artist =
      entity.artists?.map((a) => a.name).filter(Boolean).join(', ') ||
      entity.subtitle ||
      'Spotify Artist';
    const searchQuery = `${artist} - ${entity.name} audio`;
    const durationSeconds = Math.round(Number(entity.duration || 0) / 1000);
    return {
      id,
      platform: 'spotify',
      contentType: 'track',
      canonicalUrl,
      title: `${entity.name} — ${artist}`,
      author: artist,
      durationSeconds,
      thumbnailUrl: coverThumb,
      formats: buildPlaylistFormats(true).map((fmt) => ({
        ...fmt,
        searchQuery,
      })),
    };
  }

  const rawTracks = Array.isArray(entity.trackList) ? entity.trackList : [];
  if (rawTracks.length === 0) {
    throw new Error('No tracks were found in this Spotify playlist or album.');
  }

  const tracks: PlaylistTrackItem[] = rawTracks.map((tr, idx) => {
    const trackTitle = tr.title || `Track ${idx + 1}`;
    const trackArtist = tr.subtitle || entity.subtitle || 'Artist';
    const uriPart = tr.uri?.split(':').pop() || tr.uid || `${id}-${idx + 1}`;
    return {
      id: String(uriPart),
      index: idx + 1,
      platform: 'spotify',
      title: trackTitle,
      author: trackArtist,
      durationSeconds: Math.round(Number(tr.duration || 0) / 1000),
      thumbnailUrl: coverThumb,
      canonicalUrl: tr.uri?.startsWith('spotify:track:')
        ? `https://open.spotify.com/track/${uriPart}`
        : canonicalUrl,
      searchQuery: `${trackArtist} - ${trackTitle} audio`,
    };
  });

  const totalDuration = tracks.reduce((acc, t) => acc + t.durationSeconds, 0);

  return {
    id,
    platform: 'spotify',
    contentType,
    canonicalUrl,
    title: entity.name,
    author: entity.subtitle || 'Spotify Playlist',
    durationSeconds: totalDuration,
    thumbnailUrl: coverThumb,
    formats: buildPlaylistFormats(true),
    tracks,
  };
}

interface YtDlpFlatPlaylistEntry {
  id?: string;
  url?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnails?: { url?: string }[];
}

interface YtDlpPlaylistInfo {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  thumbnails?: { url?: string }[];
  entries?: YtDlpFlatPlaylistEntry[];
}

async function inspectYouTubePlaylist(
  canonicalUrl: string,
  playlistId: string
): Promise<InspectedMedia> {
  const bin = await ensureYtDlpBinary();
  const baseArgs = buildYtDlpEnvArgs().filter((arg) => arg !== '--no-playlist');

  try {
    const { stdout } = await execFileAsync(
      bin,
      [...baseArgs, '--flat-playlist', '--playlist-end', '50', '-J', canonicalUrl],
      { maxBuffer: 16 * 1024 * 1024, timeout: 25000 }
    );
    const info = JSON.parse(stdout) as YtDlpPlaylistInfo;
    const entries = Array.isArray(info.entries) ? info.entries.filter((e) => e && (e.id || e.url)) : [];
    if (entries.length === 0) {
      throw new Error('This YouTube playlist is empty or private.');
    }

    const firstThumb =
      info.thumbnails?.[info.thumbnails.length - 1]?.url ||
      entries[0]?.thumbnails?.[entries[0].thumbnails.length - 1]?.url ||
      (entries[0]?.id ? `https://i.ytimg.com/vi/${entries[0].id}/hqdefault.jpg` : '');

    const proxiedPlaylistThumb = firstThumb && isAllowedCdnUrl(firstThumb)
      ? `/api/thumbnail-proxy?url=${encodeURIComponent(firstThumb)}`
      : firstThumb;

    const tracks: PlaylistTrackItem[] = entries.map((entry, idx) => {
      const vid = entry.id || '';
      const entryThumb =
        entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
        (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '');
      const proxied = entryThumb && isAllowedCdnUrl(entryThumb)
        ? `/api/thumbnail-proxy?url=${encodeURIComponent(entryThumb)}`
        : entryThumb;
      const entryUrl = vid
        ? `https://www.youtube.com/watch?v=${vid}`
        : entry.url?.startsWith('http')
        ? entry.url
        : canonicalUrl;

      return {
        id: vid || `${playlistId}-${idx + 1}`,
        index: idx + 1,
        platform: 'youtube',
        title: entry.title || `Video ${idx + 1}`,
        author: entry.uploader || entry.channel || info.uploader || info.channel || 'YouTube Creator',
        durationSeconds: Number(entry.duration || 0),
        thumbnailUrl: proxied,
        canonicalUrl: entryUrl,
      };
    });

    const totalDuration = tracks.reduce((acc, t) => acc + t.durationSeconds, 0);

    return {
      id: playlistId,
      platform: 'youtube',
      contentType: 'playlist',
      canonicalUrl,
      title: info.title || 'YouTube Playlist',
      author: info.uploader || info.channel || 'YouTube Playlist',
      durationSeconds: totalDuration,
      thumbnailUrl: proxiedPlaylistThumb,
      formats: buildPlaylistFormats(true),
      tracks,
    };
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: unknown }).stderr || '') : '';
    const isBotBlocked =
      stderr.includes('Sign in to confirm') ||
      stderr.includes('login required') ||
      stderr.includes('cookies');
    if (isBotBlocked) {
      const blockedErr = new Error(
        'Cloud server IP was flagged by YouTube bot verification. Switch execution to Android Local Engine to inspect & download this playlist on your phone.'
      ) as Error & { code?: string };
      blockedErr.code = 'CLOUD_IP_BLOCKED';
      throw blockedErr;
    }
    throw new Error(
      err instanceof Error && !stderr ? err.message : 'Could not inspect this YouTube playlist.'
    );
  }
}

async function tryCobaltInspect(
  canonicalUrl: string,
  platform: MediaPlatform,
  id: string,
  contentType: InspectedMedia['contentType']
): Promise<InspectedMedia | null> {
  const cobaltBase = process.env.COBALT_API_URL?.trim();
  if (!cobaltBase) return null;

  try {
    const endpoint = cobaltBase.replace(/\/+$/, '');
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ url: canonicalUrl, videoQuality: '1080' }),
      },
      10000
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      url?: string;
      filename?: string;
      picker?: { type?: string; url?: string; thumb?: string }[];
    };

    const mediaUrl = data.url || data.picker?.[0]?.url;
    if (!mediaUrl) return null;

    return {
      id,
      platform,
      contentType,
      canonicalUrl,
      title: data.filename?.replace(/\.[a-z0-9]+$/i, '') || `${platform === 'youtube' ? 'YouTube' : 'Instagram'} Video`,
      author: platform === 'youtube' ? 'YouTube' : 'Instagram',
      durationSeconds: 0,
      thumbnailUrl: data.picker?.[0]?.thumb || (platform === 'youtube' ? `/api/thumbnail-proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}` : ''),
      formats: [
        {
          id: 'cobalt-1080',
          kind: 'video',
          label: 'Full HD Video',
          quality: '1080p',
          container: 'mp4',
          codec: 'H.264 + AAC',
          hasAudio: true,
          hasVideo: true,
          directUrl: mediaUrl,
        },
      ],
    };
  } catch {
    return null;
  }
}

async function inspectViaYtDlp(
  canonicalUrl: string,
  platform: MediaPlatform,
  id: string,
  contentType: InspectedMedia['contentType']
): Promise<InspectedMedia> {
  const cobaltHit = await tryCobaltInspect(canonicalUrl, platform, id, contentType);
  if (cobaltHit) return cobaltHit;

  const bin = await ensureYtDlpBinary();
  const baseArgs = buildYtDlpEnvArgs();

  try {
    const { stdout } = await execFileAsync(
      bin,
      [...baseArgs, '-J', canonicalUrl],
      { maxBuffer: 16 * 1024 * 1024, timeout: 20000 }
    );
    const info = JSON.parse(stdout) as YtDlpInfo;
    return mapYtDlpInfo(info, platform, contentType, canonicalUrl);
  } catch (err) {
    const stderr = err && typeof err === 'object' && 'stderr' in err ? String((err as { stderr?: unknown }).stderr || '') : '';
    const isBotBlocked =
      stderr.includes('Sign in to confirm') ||
      stderr.includes('empty media response') ||
      stderr.includes('login required') ||
      stderr.includes('cookies');

    if (isBotBlocked) {
      const blockedErr = new Error(
        platform === 'youtube'
          ? 'Cloud server IP was flagged by YouTube bot verification. Switch execution to Android Local Engine to download all YouTube videos directly on your phone.'
          : 'Instagram blocked anonymous cloud server inspection. Switch execution to Android Local Engine to download directly on your phone.'
      ) as Error & { code?: string };
      blockedErr.code = 'CLOUD_IP_BLOCKED';
      throw blockedErr;
    }

    throw new Error(stderr.split('\n').find((l) => l.startsWith('ERROR:')) || 'Could not inspect this media link.');
  }
}

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, engine: 'cloud' });
  });

  app.get('/api/android-script', (req: Request, res: Response) => {
    const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const origin = `${proto}://${host}`;
    const script = [
      '#!/data/data/com.termux/files/usr/bin/bash',
      'set -e',
      'echo "Installing VeloSave Android On-Device Engine..."',
      'pkg update -y && pkg install -y nodejs yt-dlp ffmpeg curl',
      `curl -fsSL "${origin}/velosave-android.mjs" -o "$HOME/velosave-android.mjs"`,
      'echo "Starting VeloSave Engine on http://127.0.0.1:3847"',
      'node "$HOME/velosave-android.mjs"',
      '',
    ].join('\n');

    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="velosave-termux-setup.sh"');
    res.send(script);
  });

  app.post('/api/inspect', async (req: Request, res: Response) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    const parsed = parseMediaUrl(rawUrl);

    if (!parsed.valid || !parsed.platform || !parsed.id || !parsed.canonicalUrl || !parsed.contentType) {
      res.status(400).json({ error: parsed.error || 'Invalid YouTube, Instagram, or Spotify link.' });
      return;
    }

    try {
      let media: InspectedMedia;
      if (parsed.platform === 'spotify') {
        const spType =
          parsed.contentType === 'album' || parsed.contentType === 'track'
            ? parsed.contentType
            : 'playlist';
        media = await inspectSpotifyPublicMetadata(parsed.canonicalUrl, spType, parsed.id);
      } else if (parsed.platform === 'youtube' && parsed.contentType === 'playlist') {
        media = await inspectYouTubePlaylist(parsed.canonicalUrl, parsed.id);
      } else {
        media = await inspectViaYtDlp(
          parsed.canonicalUrl,
          parsed.platform,
          parsed.id,
          parsed.contentType
        );
        if (parsed.playlistUrl) {
          media.playlistUrl = parsed.playlistUrl;
        }
      }
      res.json(media);
    } catch (err) {
      const typed = err as Error & { code?: string };
      res.status(422).json({
        error: typed.message || 'Unable to inspect media link.',
        code: typed.code || 'INSPECT_FAILED',
      });
    }
  });

  app.get('/api/thumbnail-proxy', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const safeUrl = isAllowedCdnUrl(rawUrl);
    if (!safeUrl) {
      res.status(400).json({ error: 'Invalid thumbnail URL' });
      return;
    }

    try {
      const upstream = await fetchWithTimeout(safeUrl.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }, 7000);
      if (!upstream.ok || !upstream.body) {
        res.status(502).end();
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.status(415).end();
        return;
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const arrayBuf = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch {
      res.status(502).end();
    }
  });

  app.get('/api/sample-asset', async (req: Request, res: Response) => {
    const sampleKey = req.query.sampleKey === 'ig-demo' ? 'ig-demo' : 'yt-demo';
    const kind = req.query.kind === 'audio' ? 'audio' : 'video';
    const requestedExt = req.query.ext === 'mp3' ? 'mp3' : kind === 'audio' ? 'm4a' : 'mp4';
    const requestedName = typeof req.query.filename === 'string' ? req.query.filename : 'VeloSave_Sample';
    const safeFilename = sanitizeFilename(requestedName.replace(/\.[a-zA-Z0-9]+$/, ''), requestedExt);

    const tmpFile = path.join(os.tmpdir(), `velosave-${sampleKey}-${kind}-${Date.now()}.${requestedExt}`);
    try {
      const color = sampleKey === 'ig-demo' ? '#1e293b' : '#0f172a';
      const freq = sampleKey === 'ig-demo' ? '528' : '440';
      const ffmpegArgs =
        requestedExt === 'mp3'
          ? [
              '-y',
              '-f', 'lavfi',
              '-i', `sine=frequency=${freq}:duration=4`,
              '-c:a', 'libmp3lame',
              '-b:a', '192k',
              tmpFile,
            ]
          : kind === 'audio'
          ? [
              '-y',
              '-f', 'lavfi',
              '-i', `sine=frequency=${freq}:duration=4`,
              '-c:a', 'aac',
              '-b:a', '128k',
              tmpFile,
            ]
          : [
              '-y',
              '-f', 'lavfi',
              '-i', `color=c=${color}:s=1280x720:d=4`,
              '-f', 'lavfi',
              '-i', `sine=frequency=${freq}:duration=4`,
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-preset', 'ultrafast',
              '-c:a', 'aac',
              '-shortest',
              tmpFile,
            ];

      await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 10000 });
      const fileBuffer = await fs.promises.readFile(tmpFile);
      res.setHeader(
        'Content-Type',
        requestedExt === 'mp3' ? 'audio/mpeg' : kind === 'audio' ? 'audio/mp4' : 'video/mp4'
      );
      res.setHeader('Content-Length', String(fileBuffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(fileBuffer);
    } catch {
      res.status(500).json({ error: 'Sample media generation failed.' });
    } finally {
      fs.promises.unlink(tmpFile).catch(() => {});
    }
  });

  app.get('/api/download', async (req: Request, res: Response) => {
    const rawDirectUrl = typeof req.query.directUrl === 'string' ? req.query.directUrl : '';
    const rawPageUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const rawQuery = typeof req.query.query === 'string' ? req.query.query : '';
    const itagParam = typeof req.query.itag === 'string' ? req.query.itag : 'bestvideo+bestaudio/best';
    const extParam = typeof req.query.ext === 'string' ? req.query.ext : 'mp4';
    const rawFilename = typeof req.query.filename === 'string' ? req.query.filename : 'velosave_media';
    const safeFilename = sanitizeFilename(rawFilename.replace(/\.[a-zA-Z0-9]+$/, ''), extParam);

    if (rawDirectUrl) {
      const safeDirect = isAllowedCdnUrl(rawDirectUrl);
      if (!safeDirect) {
        res.status(400).json({ error: 'Blocked or unsupported media CDN URL.' });
        return;
      }

      try {
        const upstream = await fetchWithTimeout(safeDirect.toString(), {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }, 15000);
        if (!upstream.ok) {
          res.status(502).json({ error: 'Upstream media server declined download.' });
          return;
        }
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        const contentLength = upstream.headers.get('content-length');
        res.setHeader('Content-Type', contentType);
        if (contentLength) {
          res.setHeader('Content-Length', contentLength);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        const arrayBuf = await upstream.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
        return;
      } catch {
        res.status(502).json({ error: 'Failed to download media asset.' });
        return;
      }
    }

    const cleanQuery = rawQuery.replace(/[\r\n\0]/g, ' ').trim().slice(0, 160);
    let downloadTarget = '';
    if (cleanQuery) {
      downloadTarget = `ytsearch1:${cleanQuery}`;
    } else {
      const parsed = parseMediaUrl(rawPageUrl);
      if (!parsed.valid || !parsed.canonicalUrl || parsed.platform === 'spotify') {
        res.status(400).json({ error: 'Valid YouTube, Instagram, or track search target is required.' });
        return;
      }
      downloadTarget = parsed.canonicalUrl;
    }

    try {
      const bin = await ensureYtDlpBinary();
      const baseArgs = buildYtDlpEnvArgs();
      const safeExt = extParam === 'mp3' ? 'mp3' : extParam === 'm4a' ? 'm4a' : 'mp4';
      const tmpOut = path.join(
        os.tmpdir(),
        `velosave-dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${safeExt}`
      );

      const safeSelector = /^[a-zA-Z0-9_+[\]<=/.:-]+$/.test(itagParam)
        ? itagParam
        : 'bestvideo+bestaudio/best';

      const args =
        safeExt === 'mp3'
          ? [...baseArgs, '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', tmpOut, downloadTarget]
          : safeExt === 'm4a'
          ? [...baseArgs, '-x', '--audio-format', 'm4a', '-o', tmpOut, downloadTarget]
          : [
              ...baseArgs,
              '-f',
              safeSelector,
              '--merge-output-format',
              'mp4',
              '-o',
              tmpOut,
              downloadTarget,
            ];

      const child = spawn(bin, args);
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', async (code) => {
        try {
          if (code !== 0 || !fs.existsSync(tmpOut)) {
            if (!res.headersSent) {
              res.status(502).json({
                error: stderr.includes('Sign in to confirm')
                  ? 'YouTube blocked this cloud server IP. Switch to Android Local Engine to download directly on your device.'
                  : 'Download failed on server.',
              });
            }
            return;
          }

          const stat = await fs.promises.stat(tmpOut);
          res.setHeader(
            'Content-Type',
            safeExt === 'mp3' ? 'audio/mpeg' : safeExt === 'm4a' ? 'audio/mp4' : 'video/mp4'
          );
          res.setHeader('Content-Length', String(stat.size));
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
          const stream = fs.createReadStream(tmpOut);
          stream.pipe(res);
          stream.on('close', () => {
            fs.promises.unlink(tmpOut).catch(() => {});
          });
        } catch {
          if (!res.headersSent) {
            res.status(500).json({ error: 'Could not stream downloaded media.' });
          }
          fs.promises.unlink(tmpOut).catch(() => {});
        }
      });
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Could not initialize downloader engine.' });
      }
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VeloSave server running on http://0.0.0.0:${PORT}`);
  });
}

createServer();
