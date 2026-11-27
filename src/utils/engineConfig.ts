export type ExecutionEngineMode = 'cloud' | 'android_local' | 'custom';

export interface EngineSettings {
  mode: ExecutionEngineMode;
  customUrl: string;
}

export const DEFAULT_ANDROID_ENGINE_URL = 'http://127.0.0.1:3847';
const ENGINE_STORAGE_KEY = 'velosave_engine_v1';

export function validateEngineBaseUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveApiBaseUrl(
  settings: EngineSettings,
  defaultCloudUrl?: string
): string {
  if (settings.mode === 'android_local') {
    return DEFAULT_ANDROID_ENGINE_URL;
  }
  if (settings.mode === 'custom') {
    return validateEngineBaseUrl(settings.customUrl) || '';
  }
  const envUrl =
    defaultCloudUrl ??
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '');
  return validateEngineBaseUrl(envUrl) || '';
}

export function loadEngineSettings(): EngineSettings {
  if (typeof window === 'undefined') {
    return { mode: 'cloud', customUrl: '' };
  }
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (!raw) return { mode: 'cloud', customUrl: '' };
    const parsed = JSON.parse(raw) as Partial<EngineSettings>;
    const mode: ExecutionEngineMode =
      parsed.mode === 'android_local' || parsed.mode === 'custom' ? parsed.mode : 'cloud';
    const customUrl = typeof parsed.customUrl === 'string' ? parsed.customUrl : '';
    return { mode, customUrl };
  } catch {
    return { mode: 'cloud', customUrl: '' };
  }
}

export function saveEngineSettings(settings: EngineSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
