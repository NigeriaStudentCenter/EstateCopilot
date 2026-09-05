// Affiliate attribution. A visitor arriving from a Kolo tracking link lands on
// any page with ?ref=CODE (Kolo's redirect service appends it). We stash the
// code so it survives navigation AND the Paystack hosted-checkout round-trip,
// then the signup form sends it to the backend, which reports the eventual
// conversion to Kolo.

const KEY = 'estatecopilot_ref';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // matches Kolo's default 30-day cookie window

interface StoredRef {
  code: string;
  capturedAt: number;
}

/** Call once on app load. First touch wins — a later visit without ?ref= doesn't clear an existing one. */
export function captureRef(): void {
  try {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (!code) return;
    const existing = readStored();
    if (existing) return; // first-touch attribution
    const payload: StoredRef = { code: code.toUpperCase().slice(0, 24), capturedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // private mode / storage disabled — attribution just won't work, no crash
  }
}

export function getStoredRef(): string | undefined {
  return readStored()?.code;
}

export function clearStoredRef(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function readStored(): StoredRef | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredRef;
    if (!parsed?.code || Date.now() - parsed.capturedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}
