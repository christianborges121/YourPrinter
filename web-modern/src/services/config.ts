/**
 * Application configuration and persistent storage service.
 */

const STORAGE_KEYS = {
  SERVER_URL: 'yourprinter_server_url',
  AUTH_TOKEN: 'yourprinter_auth_token',
  CAMERA_CONTINUOUS: 'yourprinter_camera_continuous',
  ACTIVE_CONTEXT_ID: 'yourprinter_active_context_id',
  DISABLED_PRINTERS: 'yourprinter_disabled_printers',
};

const DEFAULT_DEV_SERVER = 'http://localhost:3080';

export function getServerUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.SERVER_URL);
  if (stored && stored.trim().length > 0) {
    // Purge any previously saved private LAN IP or legacy preview port 3090 from localStorage
    if (stored.includes('192.168.68.') || stored.includes(':3090')) {
      localStorage.removeItem(STORAGE_KEYS.SERVER_URL);
      return typeof window !== 'undefined' ? window.location.origin : DEFAULT_DEV_SERVER;
    }
    return stored.trim().replace(/\/+$/, '');
  }

  // In browser, check if hosted on a printer server or running in dev
  if (typeof window !== 'undefined') {
    const port = window.location.port;
    if (port === '5173' || port === '3000' || port === '4173') {
      return DEFAULT_DEV_SERVER;
    }
    return window.location.origin;
  }

  return DEFAULT_DEV_SERVER;
}

export function setServerUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  localStorage.setItem(STORAGE_KEYS.SERVER_URL, clean);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  } else {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  }
}

export function getCameraContinuous(): boolean {
  return localStorage.getItem(STORAGE_KEYS.CAMERA_CONTINUOUS) === 'true';
}

export function setCameraContinuous(val: boolean): void {
  localStorage.setItem(STORAGE_KEYS.CAMERA_CONTINUOUS, String(val));
}

export function getSavedContextId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_CONTEXT_ID);
}

export function setSavedContextId(id: string | null): void {
  if (id) {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CONTEXT_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONTEXT_ID);
  }
}

export function getDisabledPrinterIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DISABLED_PRINTERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanitize any empty, null, or undefined strings
    return parsed.filter(
      (id) => typeof id === 'string' && id.trim().length > 0 && id !== 'undefined' && id !== 'null'
    );
  } catch {
    return [];
  }
}

export function setDisabledPrinterIds(ids: string[]): void {
  try {
    const clean = ids.filter(
      (id) => typeof id === 'string' && id.trim().length > 0 && id !== 'undefined' && id !== 'null'
    );
    localStorage.setItem(STORAGE_KEYS.DISABLED_PRINTERS, JSON.stringify(clean));
  } catch {
    // ignore
  }
}
