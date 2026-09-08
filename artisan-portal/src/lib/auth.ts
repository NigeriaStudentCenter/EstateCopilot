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
  } catch {
    /* ignore */
  }
}
