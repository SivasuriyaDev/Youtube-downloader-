import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSharedUrl,
  formatBytes,
  formatDuration,
  parseMediaUrl,
  sanitizeFilename,
} from './mediaParser';

test('parses standard YouTube watch, short, and youtu.be URLs', () => {
  const watch = parseMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(watch.valid, true);
  assert.equal(watch.platform, 'youtube');
  assert.equal(watch.id, 'dQw4w9WgXcQ');
  assert.equal(watch.contentType, 'video');

  const shortUrl = parseMediaUrl('https://youtu.be/jNQXAC9IVRw?si=abc123');
  assert.equal(shortUrl.valid, true);
  assert.equal(shortUrl.platform, 'youtube');
  assert.equal(shortUrl.id, 'jNQXAC9IVRw');

  const shorts = parseMediaUrl('https://youtube.com/shorts/aqz-KE-bpKQ');
  assert.equal(shorts.valid, true);
  assert.equal(shorts.contentType, 'short');
  assert.equal(shorts.id, 'aqz-KE-bpKQ');
});

test('parses Instagram reel and post URLs', () => {
  const reel = parseMediaUrl('https://www.instagram.com/reel/C8xYz9AbCdE/?igsh=xyz');
  assert.equal(reel.valid, true);
  assert.equal(reel.platform, 'instagram');
  assert.equal(reel.contentType, 'reel');
  assert.equal(reel.id, 'C8xYz9AbCdE');

  const post = parseMediaUrl('instagram.com/p/DB12345678/');
  assert.equal(post.valid, true);
  assert.equal(post.platform, 'instagram');
  assert.equal(post.contentType, 'post');
  assert.equal(post.id, 'DB12345678');
});

test('rejects unsafe schemes, private IPs, and unsupported hosts', () => {
  assert.equal(parseMediaUrl('javascript:alert(1)').valid, false);
  assert.equal(parseMediaUrl('http://localhost:3000/watch?v=dQw4w9WgXcQ').valid, false);
  assert.equal(parseMediaUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(parseMediaUrl('https://example.com/video.mp4').valid, false);
  assert.equal(parseMediaUrl('   ').valid, false);
});

test('extracts shared YouTube or Instagram link from Android share_target query params', () => {
  const shared = extractSharedUrl('?title=Cool+Reel&text=Watch+this+https%3A%2F%2Fwww.instagram.com%2Freel%2FC8xYz9AbCdE%2F%21');
  assert.equal(shared, 'https://www.instagram.com/reel/C8xYz9AbCdE/');

  const direct = extractSharedUrl('?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ');
  assert.equal(direct, 'https://youtu.be/dQw4w9WgXcQ');

  const invalid = extractSharedUrl('?text=hello+world');
  assert.equal(invalid, null);
});

test('formats duration, byte sizes, and filenames cleanly', () => {
  assert.equal(formatDuration(258), '04:18');
  assert.equal(formatDuration(3665), '1:01:05');
  assert.equal(formatDuration(0), '0:00');

  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(153600), '150 KB');
  assert.equal(formatBytes(50541363), '48.2 MB');
  assert.equal(formatBytes(undefined), 'Stream');

  assert.equal(sanitizeFilename('Morning Coffee: 4K Reel!!', 'mp4'), 'Morning_Coffee_4K_Reel.mp4');
  assert.equal(sanitizeFilename('???', 'm4a'), 'velosave_media.m4a');
});
