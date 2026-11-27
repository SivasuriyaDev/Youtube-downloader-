export type ExecutionEngineMode = 'android_inbuilt' | 'cloud' | 'android_local' | 'custom';

export interface EngineSettings {
  mode: ExecutionEngineMode;
  customUrl: string;
}

export const DEFAULT_ANDROID_ENGINE_URL = 'http://127.0.0.1:3847';
const ENGINE_STORAGE_KEY = 'velosave_engine_v2';

export function detectNativeAndroidCapable(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    androidBridge?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  if (win.androidBridge) return true;
  if (!win.Capacitor || typeof win.Capacitor.isNativePlatform !== 'function') return false;
  return win.Capacitor.isNativePlatform() && win.Capacitor.getPlatform?.() === 'android';
}

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

export function getDefaultEngineMode(isNativeAndroid = detectNativeAndroidCapable()): ExecutionEngineMode {
  return isNativeAndroid ? 'android_inbuilt' : 'cloud';
}

export function parseStoredEngineSettings(
  rawJson: string | null,
  isNativeAndroid = false
): EngineSettings {
  const fallbackMode = getDefaultEngineMode(isNativeAndroid);
  if (!rawJson) {
    return { mode: fallbackMode, customUrl: '' };
  }
  try {
    const parsed = JSON.parse(rawJson) as Partial<EngineSettings>;
    const customUrl = typeof parsed.customUrl === 'string' ? parsed.customUrl : '';
    if (parsed.mode === 'android_inbuilt') {
      return { mode: isNativeAndroid ? 'android_inbuilt' : 'cloud', customUrl };
    }
    if (parsed.mode === 'android_local' || parsed.mode === 'custom' || parsed.mode === 'cloud') {
      return { mode: parsed.mode, customUrl };
    }
    return { mode: fallbackMode, customUrl };
  } catch {
    return { mode: fallbackMode, customUrl: '' };
  }
}

export function loadEngineSettings(): EngineSettings {
  const isNative = detectNativeAndroidCapable();
  if (typeof window === 'undefined') {
    return { mode: getDefaultEngineMode(isNative), customUrl: '' };
  }
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    return parseStoredEngineSettings(raw, isNative);
  } catch {
    return { mode: getDefaultEngineMode(isNative), customUrl: '' };
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
