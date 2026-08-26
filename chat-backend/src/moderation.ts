// Automatic-only moderation for v1 (the chosen option: ship fast, no
// human review needed to go live). Two independent checks — a per-socket
// rate limiter so one connection can't flood the room, and a content
// filter that silently rejects the two biggest abuse vectors in an
// anonymous public chat: raw links (spam) and a short profanity list.
// Neither disconnects the sender — an over-limit or rejected message is
// just dropped, with a local-only notice back to that one socket.

const MAX_TOKENS = 3;
const REFILL_MS = 3000; // one token every 3s

export class RateLimiter {
  private tokens = MAX_TOKENS;
  private lastRefill = Date.now();

  tryConsume(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refill = Math.floor(elapsed / REFILL_MS);
    if (refill > 0) {
      this.tokens = Math.min(MAX_TOKENS, this.tokens + refill);
      this.lastRefill = now;
    }
    if (this.tokens <= 0) return false;
    this.tokens--;
    return true;
  }
}

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;

// Deliberately short and generic — this is a first-line filter, not a
// complete solution. Easy to extend without touching the server logic.
const BLOCKED_WORDS = ['fuck', 'shit', 'bitch', 'nigger', 'asshole', 'cunt'];

export function isMessageAllowed(text: string): { allowed: boolean; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { allowed: false, reason: 'empty' };
  if (trimmed.length > 300) return { allowed: false, reason: 'too long' };
  if (URL_PATTERN.test(trimmed)) return { allowed: false, reason: 'links are not allowed in chat' };
  const lower = trimmed.toLowerCase();
  if (BLOCKED_WORDS.some((word) => lower.includes(word))) {
    return { allowed: false, reason: 'message not allowed' };
  }
  return { allowed: true };
}
