import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANDROID_ENGINE_URL,
  getDefaultEngineMode,
  parseStoredEngineSettings,
  resolveApiBaseUrl,
  validateEngineBaseUrl,
} from './engineConfig';

test('validates custom engine base URLs safely', () => {
  assert.equal(validateEngineBaseUrl('http://192.168.1.40:3847/'), 'http://192.168.1.40:3847');
  assert.equal(validateEngineBaseUrl('https://my-cobalt.example.com/api'), 'https://my-cobalt.example.com');
  assert.equal(validateEngineBaseUrl('javascript:alert(1)'), null);
  assert.equal(validateEngineBaseUrl('not-a-url'), null);
});

test('resolves API base URL per execution mode', () => {
  assert.equal(resolveApiBaseUrl({ mode: 'cloud', customUrl: '' }), '');
  assert.equal(resolveApiBaseUrl({ mode: 'android_inbuilt', customUrl: '' }), '');
  assert.equal(
    resolveApiBaseUrl({ mode: 'android_local', customUrl: '' }),
    DEFAULT_ANDROID_ENGINE_URL
  );
  assert.equal(
    resolveApiBaseUrl({ mode: 'custom', customUrl: 'http://192.168.1.25:3000/' }),
    'http://192.168.1.25:3000'
  );
  assert.equal(resolveApiBaseUrl({ mode: 'custom', customUrl: 'invalid' }), '');
  assert.equal(
    resolveApiBaseUrl({ mode: 'cloud', customUrl: '' }, 'https://velosave.example.com/'),
    'https://velosave.example.com'
  );
});

test('auto-selects inbuilt engine on native Android APK and cloud on web', () => {
  assert.equal(getDefaultEngineMode(true), 'android_inbuilt');
  assert.equal(getDefaultEngineMode(false), 'cloud');
  assert.deepEqual(parseStoredEngineSettings(null, true), { mode: 'android_inbuilt', customUrl: '' });
  assert.deepEqual(parseStoredEngineSettings(null, false), { mode: 'cloud', customUrl: '' });
  // Never stay stuck in android_inbuilt inside a regular web browser
  assert.deepEqual(
    parseStoredEngineSettings(JSON.stringify({ mode: 'android_inbuilt', customUrl: '' }), false),
    { mode: 'cloud', customUrl: '' }
  );
});
