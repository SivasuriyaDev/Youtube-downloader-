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
import type { InspectedMedia, MediaFormat, MediaPlatform } from './src/types/media.ts';

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

  formats.push({
    id: 'a-m4a',
    kind: 'audio',
    label: 'Audio Track',
    quality: '192 kbps',
    container: 'm4a',
    codec: 'AAC',
    hasAudio: true,
    hasVideo: false,
    itag: 'bestaudio',
  });

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
      res.status(400).json({ error: parsed.error || 'Invalid YouTube or Instagram link.' });
      return;
    }

    try {
      const media = await inspectViaYtDlp(
        parsed.canonicalUrl,
        parsed.platform,
        parsed.id,
        parsed.contentType
      );
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
    const requestedName = typeof req.query.filename === 'string' ? req.query.filename : 'VeloSave_Sample';
    const ext = kind === 'audio' ? 'm4a' : 'mp4';
    const safeFilename = sanitizeFilename(requestedName.replace(/\.[a-zA-Z0-9]+$/, ''), ext);

    const tmpFile = path.join(os.tmpdir(), `velosave-${sampleKey}-${kind}-${Date.now()}.${ext}`);
    try {
      const color = sampleKey === 'ig-demo' ? '#1e293b' : '#0f172a';
      const freq = sampleKey === 'ig-demo' ? '528' : '440';
      const ffmpegArgs =
        kind === 'audio'
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
      res.setHeader('Content-Type', kind === 'audio' ? 'audio/mp4' : 'video/mp4');
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

    const parsed = parseMediaUrl(rawPageUrl);
    if (!parsed.valid || !parsed.canonicalUrl) {
      res.status(400).json({ error: 'Valid YouTube or Instagram link is required.' });
      return;
    }

    try {
      const bin = await ensureYtDlpBinary();
      const baseArgs = buildYtDlpEnvArgs();
      const safeExt = extParam === 'm4a' ? 'm4a' : 'mp4';
      const tmpOut = path.join(
        os.tmpdir(),
        `velosave-dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${safeExt}`
      );

      const safeSelector = /^[a-zA-Z0-9_+[\]<=/.:-]+$/.test(itagParam)
        ? itagParam
        : 'bestvideo+bestaudio/best';

      const args =
        safeExt === 'm4a'
          ? [...baseArgs, '-x', '--audio-format', 'm4a', '-o', tmpOut, parsed.canonicalUrl]
          : [
              ...baseArgs,
              '-f',
              safeSelector,
              '--merge-output-format',
              'mp4',
              '-o',
              tmpOut,
              parsed.canonicalUrl,
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
          res.setHeader('Content-Type', safeExt === 'm4a' ? 'audio/mp4' : 'video/mp4');
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
