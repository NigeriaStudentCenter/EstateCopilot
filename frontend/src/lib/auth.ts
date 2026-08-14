const TOKEN_KEY = 'ec_landlord_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Arriving from the marketing site's signup flow lands here as
// `/?token=<jwt>` — pick it up once, persist it, and scrub it from the
// visible URL so it doesn't linger in browser history or get shared.
export function consumeUrlToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    setToken(token);
    params.delete('token');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }
}
