import Anthropic from '@anthropic-ai/sdk';
import type { Provider, RunRequest, Tier } from './types.js';

// Basic web-search tool variant: works on both Sonnet 4.6 and Haiku 4.5,
// and is the variant the original student page was built and tested with.
// Sonnet can move up to web_search_20260209 (dynamic filtering) later —
// hence the env override — but Haiku 4.5 does not support that variant, so
// the default stays basic for a uniform setup.
const WEB_SEARCH_TOOL = process.env.WEB_SEARCH_TOOL || 'web_search_20250305';
const WEB_SEARCH_MAX_USES = Number(process.env.WEB_SEARCH_MAX_USES) || 5;

// A server-side web-search turn can stop with stop_reason "pause_turn"
// when it hits an internal iteration limit — not an error, just "call me
// again to keep going". Re-send the assistant turn to resume. Cap the
// resumes so a pathological run can't loop forever.
const MAX_RESUMES = 6;

interface TierConfig {
  model: string;
  maxTokens: number;
  adaptiveThinking: boolean;
}

function tierConfig(tier: Tier): TierConfig {
  if (tier === 'smart') {
    return {
      model: process.env.MODEL_SMART || 'claude-sonnet-4-6',
      maxTokens: Number(process.env.MAX_TOKENS_SMART) || 4000,
      adaptiveThinking: true,
    };
  }
  return {
    model: process.env.MODEL_FAST || 'claude-haiku-4-5',
    maxTokens: Number(process.env.MAX_TOKENS_FAST) || 2000,
    adaptiveThinking: false,
  };
}

export function createAnthropicProvider(): Provider {
  // Reads ANTHROPIC_API_KEY from the environment (App Service app setting).
  const client = new Anthropic();

  return {
    async run(req: RunRequest): Promise<{ text: string }> {
      const cfg = tierConfig(req.tier);
      const messages = req.messages as Anthropic.MessageParam[];

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        messages,
      };
      if (cfg.adaptiveThinking) {
        // `adaptive` is the current wire value for Sonnet 4.6; the SDK's
        // 0.68 type union predates it, so cast through unknown. The SDK
        // only serializes this object — the value reaches the API intact.
        params.thinking = { type: 'adaptive' } as unknown as Anthropic.ThinkingConfigParam;
      }
      if (req.web) {
        // Loosely typed: the exact tool-union type name shifts between SDK
        // minor versions and this literal is stable on the wire.
        params.tools = [
          { type: WEB_SEARCH_TOOL, name: 'web_search', max_uses: WEB_SEARCH_MAX_USES },
        ] as unknown as Anthropic.MessageCreateParams['tools'];
      }

      let working: Anthropic.MessageParam[] = messages;
      let resumes = 0;

      while (true) {
        const res = await client.messages.create({ ...params, messages: working });

        if (res.stop_reason === 'pause_turn' && resumes < MAX_RESUMES) {
          resumes++;
          working = [...working, { role: 'assistant', content: res.content }];
          continue;
        }

        const text = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();

        return { text };
      }
    },
  };
}
