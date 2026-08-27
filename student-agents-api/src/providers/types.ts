// The seam between the HTTP layer and whichever model provider is in use.
// The request the browser sends is deliberately small and provider-neutral
// (a tier + the message list + a web-search flag); each provider module
// turns that into its own API call and returns plain text.

export type Tier = 'smart' | 'fast';

export interface RunRequest {
  tier: Tier;
  /**
   * Anthropic-shaped message list. Kept as-is so a document/image block
   * (the Study Companion's uploaded brief) passes straight through without
   * the server needing to understand it. A future non-Anthropic provider
   * would map this to its own shape.
   */
  messages: unknown[];
  web: boolean;
}

export interface Provider {
  run(req: RunRequest): Promise<{ text: string }>;
}
