#!/usr/bin/env node
/**
 * VeloSave Android On-Device Engine (Termux / Localhost)
 * Runs yt-dlp + ffmpeg on your own phone IP so YouTube, Instagram,
 * playlists, and Spotify track matches download without cloud blocks.
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
  'open.spotify.com',
  'play.spotify.com',
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
    return u;
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

function detectPlatform(urlObj) {
  const h = urlObj.hostname.toLowerCase();
  if (h.includes('spotify')) return 'spotify';
  if (h.includes('instagram') || h === 'instagr.am') return 'instagram';
  return 'youtube';
}

function buildPlaylistFormats() {
  return [
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
}

function mapYtDlpFormats(info, canonicalUrl) {
  const urlObj = new URL(canonicalUrl);
  const platform = detectPlatform(urlObj);
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

async function inspectSpotifyLocal(urlObj) {
  const parts = urlObj.pathname.split('/').filter(Boolean);
  const cleaned = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
  const kind = cleaned[0];
  const id = cleaned[1];
  if (!['playlist', 'album', 'track'].includes(kind) || !id) {
    throw new Error('Invalid Spotify playlist, album, or track URL.');
  }

  const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error('Could not fetch public Spotify metadata.');
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not parse Spotify metadata.');

  const data = JSON.parse(match[1]);
  const entity = data?.props?.pageProps?.state?.data?.entity;
  if (!entity || !entity.name) throw new Error('Spotify item appears private or unavailable.');

  const cover = entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url || '';
  const canonicalUrl = `https://open.spotify.com/${kind}/${id}`;

  if (kind === 'track') {
    const artist =
      entity.artists?.map((a) => a.name).filter(Boolean).join(', ') ||
      entity.subtitle ||
      'Spotify Artist';
    const searchQuery = `${artist} - ${entity.name} audio`;
    return {
      id,
      platform: 'spotify',
      contentType: 'track',
      canonicalUrl,
      title: `${entity.name} — ${artist}`,
      author: artist,
      durationSeconds: Math.round(Number(entity.duration || 0) / 1000),
      thumbnailUrl: cover,
      formats: buildPlaylistFormats().map((f) => ({ ...f, searchQuery })),
    };
  }

  const rawTracks = Array.isArray(entity.trackList) ? entity.trackList : [];
  if (rawTracks.length === 0) throw new Error('No tracks found in this Spotify playlist.');

  const tracks = rawTracks.map((tr, idx) => {
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
      thumbnailUrl: cover,
      canonicalUrl: tr.uri?.startsWith('spotify:track:')
        ? `https://open.spotify.com/track/${uriPart}`
        : canonicalUrl,
      searchQuery: `${trackArtist} - ${trackTitle} audio`,
    };
  });

  return {
    id,
    platform: 'spotify',
    contentType: kind,
    canonicalUrl,
    title: entity.name,
    author: entity.subtitle || 'Spotify Playlist',
    durationSeconds: tracks.reduce((a, b) => a + b.durationSeconds, 0),
    thumbnailUrl: cover,
    formats: buildPlaylistFormats(),
    tracks,
  };
}

async function inspectYouTubePlaylistLocal(canonicalUrl, playlistId) {
  const { stdout } = await execFileAsync(
    'yt-dlp',
    ['--no-warnings', '--flat-playlist', '--playlist-end', '50', '-J', canonicalUrl],
    { maxBuffer: 16 * 1024 * 1024, timeout: 35000 }
  );
  const info = JSON.parse(stdout);
  const entries = Array.isArray(info.entries) ? info.entries.filter((e) => e && (e.id || e.url)) : [];
  if (entries.length === 0) throw new Error('YouTube playlist is empty or private.');

  const firstThumb =
    info.thumbnails?.[info.thumbnails.length - 1]?.url ||
    (entries[0]?.id ? `https://i.ytimg.com/vi/${entries[0].id}/hqdefault.jpg` : '');

  const tracks = entries.map((entry, idx) => {
    const vid = entry.id || '';
    const thumb =
      entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
      (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : '');
    return {
      id: vid || `${playlistId}-${idx + 1}`,
      index: idx + 1,
      platform: 'youtube',
      title: entry.title || `Video ${idx + 1}`,
      author: entry.uploader || entry.channel || info.uploader || info.channel || 'YouTube Creator',
      durationSeconds: Number(entry.duration || 0),
      thumbnailUrl: thumb,
      canonicalUrl: vid ? `https://www.youtube.com/watch?v=${vid}` : entry.url || canonicalUrl,
    };
  });

  return {
    id: playlistId,
    platform: 'youtube',
    contentType: 'playlist',
    canonicalUrl,
    title: info.title || 'YouTube Playlist',
    author: info.uploader || info.channel || 'YouTube Playlist',
    durationSeconds: tracks.reduce((a, b) => a + b.durationSeconds, 0),
    thumbnailUrl: firstThumb,
    formats: buildPlaylistFormats(),
    tracks,
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

    const urlObj = validateUrl(parsedBody.url);
    if (!urlObj) {
      sendJson(res, 400, { error: 'Valid YouTube, Instagram, or Spotify URL is required.' });
      return;
    }

    const platform = detectPlatform(urlObj);

    try {
      if (platform === 'spotify') {
        const spResult = await inspectSpotifyLocal(urlObj);
        sendJson(res, 200, spResult);
        return;
      }

      if (platform === 'youtube' && urlObj.pathname.startsWith('/playlist') && urlObj.searchParams.get('list')) {
        const plResult = await inspectYouTubePlaylistLocal(urlObj.toString(), urlObj.searchParams.get('list'));
        sendJson(res, 200, plResult);
        return;
      }

      const { stdout } = await execFileAsync(
        'yt-dlp',
        ['--no-warnings', '--no-playlist', '-J', urlObj.toString()],
        { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }
      );
      const info = JSON.parse(stdout);
      sendJson(res, 200, mapYtDlpFormats(info, urlObj.toString()));
    } catch (err) {
      sendJson(res, 422, {
        error: err?.stderr?.trim() || err?.message || 'yt-dlp failed to inspect this link.',
      });
    }
    return;
  }

  if (req.method === 'GET' && reqUrl.pathname === '/api/download') {
    const safeUrlObj = validateUrl(reqUrl.searchParams.get('url'));
    const rawQuery = reqUrl.searchParams.get('query') || '';
    const directUrl = reqUrl.searchParams.get('directUrl') || '';
    const formatSelector = reqUrl.searchParams.get('itag') || 'bestvideo+bestaudio/best';
    const rawExt = reqUrl.searchParams.get('ext') || 'mp4';
    const ext = rawExt === 'mp3' ? 'mp3' : rawExt === 'm4a' ? 'm4a' : rawExt === 'jpg' ? 'jpg' : 'mp4';
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

    const cleanQuery = rawQuery.replace(/[\r\n\0]/g, ' ').trim().slice(0, 160);
    const target = cleanQuery
      ? `ytsearch1:${cleanQuery}`
      : safeUrlObj && detectPlatform(safeUrlObj) !== 'spotify'
      ? safeUrlObj.toString()
      : null;

    if (!target) {
      sendJson(res, 400, { error: 'Valid media URL or track query is required.' });
      return;
    }

    const tmpOut = path.join(os.tmpdir(), `velosave-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`);
    const args =
      ext === 'mp3'
        ? ['--no-warnings', '--no-playlist', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', tmpOut, target]
        : ext === 'm4a'
        ? ['--no-warnings', '--no-playlist', '-x', '--audio-format', 'm4a', '-o', tmpOut, target]
        : [
            '--no-warnings',
            '--no-playlist',
            '-f',
            /^[a-zA-Z0-9_+[\]<=/.:-]+$/.test(formatSelector) ? formatSelector : 'bestvideo+bestaudio/best',
            '--merge-output-format',
            'mp4',
            '-o',
            tmpOut,
            target,
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
          'Content-Type': ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'video/mp4',
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
