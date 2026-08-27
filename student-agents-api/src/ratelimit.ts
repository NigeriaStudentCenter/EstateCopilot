// Per-IP request cap, in memory. A rolling window of timestamps per IP:
// on each call, drop timestamps older than the window, then allow only if
// the remaining count is under the limit.
//
// In memory means the limit is per running instance — fine while this is
// a single App Service instance (the default). If it is ever scaled out,
// move this to Redis / Azure Cache so the limit is shared. Documented,
// not hidden.

const WINDOW_MS = 60 * 60 * 1000; // one hour

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly limit: number;

  constructor(limitPerHour: number) {
    this.limit = Math.max(1, limitPerHour);
    // Periodic sweep so IPs that stop calling don't leak memory forever.
    const timer = setInterval(() => this.sweep(), WINDOW_MS);
    timer.unref?.();
  }

  /** Returns true if this IP is allowed to proceed, and records the hit. */
  tryConsume(ip: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= this.limit) {
      this.hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(ip, recent);
    return true;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [ip, times] of this.hits) {
      const recent = times.filter((t) => now - t < WINDOW_MS);
      if (recent.length) this.hits.set(ip, recent);
      else this.hits.delete(ip);
    }
  }
}
