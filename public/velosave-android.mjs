#!/usr/bin/env node
/**
 * VeloSave Android On-Device Engine (Termux / Localhost)
 * Runs yt-dlp + ffmpeg on your own phone IP so YouTube & Instagram
 * downloads bypass cloud datacenter restrictions.
 *
 * Termux setup:
 *   pkg update -y && pkg install -y nodejs yt-dlp ffmpeg
 *   node velosave-android.mjs
 */
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.VELOSAVE_PORT || 3847);

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
]);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function sendJson(res, status, data) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function validateUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sanitizeName(title, ext) {
  const base = String(title || 'velosave_media')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 56);
  const safeExt = String(ext || 'mp4').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
  return `${base || 'velosave_media'}.${safeExt}`;
}

function detectPlatform(urlStr) {
  const h = new URL(urlStr).hostname.toLowerCase();
  return h.includes('instagram') || h === 'instagr.am' ? 'instagram' : 'youtube';
}

function mapYtDlpFormats(info, canonicalUrl) {
  const platform = detectPlatform(canonicalUrl);
  const rawFormats = Array.isArray(info.formats) ? info.formats : [];
  const formats = [];
  const seenHeights = new Set();

  const videoCandidates = rawFormats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height)
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
  }

  return {
    id: String(info.id || Date.now()),
    platform,
    contentType: platform === 'instagram' ? 'reel' : canonicalUrl.includes('/shorts/') ? 'short' : 'video',
    canonicalUrl,
    title: info.title || 'Media Video',
    author: info.uploader || info.channel || (platform === 'instagram' ? '@instagram' : 'YouTube Creator'),
    durationSeconds: Number(info.duration || 0),
    thumbnailUrl: info.thumbnail || '',
    formats,
  };
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && reqUrl.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, engine: 'android-local' });
    return;
  }

  if (req.method === 'POST' && reqUrl.pathname === '/api/inspect') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 32768) {
        sendJson(res, 413, { error: 'Payload too large' });
        return;
      }
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(body || '{}');
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const safeUrl = validateUrl(parsedBody.url);
    if (!safeUrl) {
      sendJson(res, 400, { error: 'Valid YouTube or Instagram URL is required.' });
      return;
    }

    try {
      const { stdout } = await execFileAsync(
        'yt-dlp',
        ['--no-warnings', '--no-playlist', '-J', safeUrl],
        { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }
      );
      const info = JSON.parse(stdout);
      sendJson(res, 200, mapYtDlpFormats(info, safeUrl));
    } catch (err) {
      sendJson(res, 422, {
        error: err?.stderr?.trim() || err?.message || 'yt-dlp failed to inspect this link.',
      });
    }
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/download') {
    const safeUrl = validateUrl(reqUrl.searchParams.get('url'));
    const directUrl = reqUrl.searchParams.get('directUrl') || '';
    const formatSelector = reqUrl.searchParams.get('itag') || 'bestvideo+bestaudio/best';
    const ext = reqUrl.searchParams.get('ext') || 'mp4';
    const filename = sanitizeName(
      (reqUrl.searchParams.get('filename') || 'velosave_media').replace(/\.[a-zA-Z0-9]+$/, ''),
      ext
    );

    if (directUrl && (directUrl.startsWith('https://') || directUrl.startsWith('http://'))) {
      try {
        const up = await fetch(directUrl);
        if (!up.ok) {
          sendJson(res, 502, { error: 'Upstream thumbnail download failed.' });
          return;
        }
        const buf = Buffer.from(await up.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': up.headers.get('content-type') || 'image/jpeg',
          'Content-Length': String(buf.length),
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(buf);
        return;
      } catch {
        sendJson(res, 502, { error: 'Thumbnail download error.' });
        return;
      }
    }

    if (!safeUrl) {
      sendJson(res, 400, { error: 'Valid media URL is required.' });
      return;
    }

    const tmpOut = path.join(os.tmpdir(), `velosave-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
    const args =
      ext === 'm4a'
        ? ['--no-warnings', '--no-playlist', '-x', '--audio-format', 'm4a', '-o', tmpOut, safeUrl]
        : [
            '--no-warnings',
            '--no-playlist',
            '-f',
            /^[a-zA-Z0-9_+[\]<=/.:-]+$/.test(formatSelector) ? formatSelector : 'bestvideo+bestaudio/best',
            '--merge-output-format',
            'mp4',
            '-o',
            tmpOut,
            safeUrl,
          ];

    const child = spawn('yt-dlp', args);
    let errText = '';
    child.stderr.on('data', (d) => {
      errText += d.toString();
    });

    child.on('close', async (code) => {
      try {
        if (code !== 0 || !fs.existsSync(tmpOut)) {
          sendJson(res, 500, { error: errText.trim() || 'yt-dlp download failed.' });
          return;
        }
        const stat = await fs.promises.stat(tmpOut);
        res.writeHead(200, {
          'Content-Type': ext === 'm4a' ? 'audio/mp4' : 'video/mp4',
          'Content-Length': String(stat.size),
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        const stream = fs.createReadStream(tmpOut);
        stream.pipe(res);
        stream.on('close', () => {
          fs.promises.unlink(tmpOut).catch(() => {});
        });
      } catch {
        sendJson(res, 500, { error: 'Failed to stream downloaded file.' });
        fs.promises.unlink(tmpOut).catch(() => {});
      }
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`VeloSave Android Engine listening on http://127.0.0.1:${PORT}`);
});
