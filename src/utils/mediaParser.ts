import type { MediaContentType, MediaPlatform } from '../types/media';

export interface ParsedMediaUrl {
  valid: boolean;
  platform: MediaPlatform | null;
  id: string | null;
  canonicalUrl: string | null;
  contentType: MediaContentType | null;
  error?: string;
}

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
]);

const PRIVATE_OR_LOCAL_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
];

export function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return PRIVATE_OR_LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(lower));
}

export function parseMediaUrl(rawInput: string): ParsedMediaUrl {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      valid: false,
      platform: null,
      id: null,
      canonicalUrl: null,
      contentType: null,
      error: 'Paste a YouTube or Instagram link to continue.',
    };
  }

  let normalized = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      valid: false,
      platform: null,
      id: null,
      canonicalUrl: null,
      contentType: null,
      error: 'Please enter a valid web link (for example, https://youtu.be/... or https://instagram.com/reel/...).',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      platform: null,
      id: null,
      canonicalUrl: null,
      contentType: null,
      error: 'Only standard HTTP and HTTPS links are supported.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isBlockedHost(hostname)) {
    return {
      valid: false,
      platform: null,
      id: null,
      canonicalUrl: null,
      contentType: null,
      error: 'Local or private network addresses are not allowed.',
    };
  }

  if (YOUTUBE_HOSTS.has(hostname)) {
    let videoId: string | null = null;
    let contentType: MediaContentType = 'video';

    if (hostname === 'youtu.be') {
      const seg = parsed.pathname.split('/').filter(Boolean)[0];
      if (seg && /^[a-zA-Z0-9_-]{11}$/.test(seg)) {
        videoId = seg;
      }
    } else {
      const vParam = parsed.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        videoId = vParam;
      } else {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v')) {
          if (/^[a-zA-Z0-9_-]{11}$/.test(parts[1])) {
            videoId = parts[1];
            contentType = parts[0] === 'shorts' ? 'short' : 'video';
          }
        }
      }
    }

    if (!videoId) {
      return {
        valid: false,
        platform: 'youtube',
        id: null,
        canonicalUrl: null,
        contentType: null,
        error: 'Could not find a YouTube video ID in that link. Try a watch, Shorts, or youtu.be link.',
      };
    }

    return {
      valid: true,
      platform: 'youtube',
      id: videoId,
      canonicalUrl: contentType === 'short'
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      contentType,
    };
  }

  if (INSTAGRAM_HOSTS.has(hostname)) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    let shortcode: string | null = null;
    let contentType: MediaContentType = 'reel';

    if (parts.length >= 2 && (parts[0] === 'reel' || parts[0] === 'reels' || parts[0] === 'p' || parts[0] === 'tv')) {
      if (/^[a-zA-Z0-9_-]{5,32}$/.test(parts[1])) {
        shortcode = parts[1];
        contentType = parts[0] === 'p' ? 'post' : 'reel';
      }
    } else if (parts.length >= 3 && (parts[1] === 'reel' || parts[1] === 'p')) {
      // Handles /username/reel/CODE/
      if (/^[a-zA-Z0-9_-]{5,32}$/.test(parts[2])) {
        shortcode = parts[2];
        contentType = parts[1] === 'p' ? 'post' : 'reel';
      }
    }

    if (!shortcode) {
      return {
        valid: false,
        platform: 'instagram',
        id: null,
        canonicalUrl: null,
        contentType: null,
        error: 'Could not find an Instagram Reel or Post ID in that link.',
      };
    }

    const segment = contentType === 'post' ? 'p' : 'reel';
    return {
      valid: true,
      platform: 'instagram',
      id: shortcode,
      canonicalUrl: `https://www.instagram.com/${segment}/${shortcode}/`,
      contentType,
    };
  }

  return {
    valid: false,
    platform: null,
    id: null,
    canonicalUrl: null,
    contentType: null,
    error: 'Unsupported link. VeloSave supports YouTube videos, Shorts, and Instagram Reels or Posts.',
  };
}

export function extractSharedUrl(searchString: string): string | null {
  const params = new URLSearchParams(searchString);
  const candidates = [params.get('url'), params.get('text'), params.get('title')].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0
  );

  for (const candidate of candidates) {
    const urlMatches = candidate.match(/https?:\/\/[^\s]+/gi);
    if (urlMatches) {
      for (const match of urlMatches) {
        const cleaned = match.replace(/[),.!?;:'"]+$/, '');
        if (parseMediaUrl(cleaned).valid) {
          return cleaned;
        }
      }
    }
    if (parseMediaUrl(candidate).valid) {
      return candidate.trim();
    }
  }
  return null;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0:00';
  }
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return 'Stream';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(0)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function sanitizeFilename(title: string, ext: string): string {
  const base = title
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 56);
  const safeBase = base.length > 0 ? base : 'velosave_media';
  const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
  return `${safeBase}.${cleanExt}`;
}
