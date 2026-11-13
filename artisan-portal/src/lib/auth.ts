const KEY = 'ec_artisan_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
    // Per-user cached diagnoses must not survive on a shared phone after sign-out.
    Object.keys(localStorage).filter((k) => k.startsWith('ec_diag_')).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
