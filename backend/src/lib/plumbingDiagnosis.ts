import { env } from '../config/env.js';
import { diagnosisSchema, BASE_TOOL, str, type Diagnosis, type DiagnosisTrade } from './diagnosisSchema.js';
import { tradeConfig, ISOLATE_STEP, RETEST_STEP } from './diagnosisTrades/index.js';

// The diagnosis engine. Everything that differs per trade (prompt, guards, access, mock data) lives in
// lib/diagnosisTrades/; the schema and forced tool are in lib/diagnosisSchema.ts. Old import paths keep working.
export { diagnosisSchema, ISOLATE_STEP, RETEST_STEP };
export type { Diagnosis, DiagnosisTrade };

// One forced tool, shaped per trade: the "not this trade" outcome differs, and trades with tests/measurements add "checks".
export function toolFor(trade: DiagnosisTrade) {
  if (trade === 'PLUMBING') return BASE_TOOL;
  const cfg = tradeConfig(trade);
  return {
    ...BASE_TOOL,
    description: `Report the ${cfg.label.toLowerCase()} diagnosis for the photo(s). Always call this tool exactly once.`,
    input_schema: {
      ...BASE_TOOL.input_schema,
      properties: {
        ...BASE_TOOL.input_schema.properties,
        outcome: { type: 'string', enum: ['DIAGNOSED', 'NEEDS_MORE_PHOTOS', cfg.notOutcome] },
        ...(cfg.withChecks ? { checks: { type: 'array', maxItems: 8, items: str(240) } } : {}),
      },
    },
  };
}

export const systemFor = (trade: DiagnosisTrade) => tradeConfig(trade).system;

// The AI is shown Kolo's standard parts list and asked to pick from it, so a "20mm PPR elbow" means the same thing to the
// model, the shops that price it and the plumber comparing quotes. Free text stays allowed for anything not on the list.
export interface CatalogueEntry { id: string; name: string; unit: string; specs: string[] }

export function catalogueTool(catalogue: CatalogueEntry[], trade: DiagnosisTrade = 'PLUMBING') {
  const base = toolFor(trade);
  if (catalogue.length === 0) return base;
  const parts = base.input_schema.properties.parts;
  return {
    ...base,
    input_schema: {
      ...base.input_schema,
      properties: {
        ...base.input_schema.properties,
        // enum = the model physically cannot return an id that is not on the list
        parts: { ...parts, items: { ...parts.items, properties: { ...parts.items.properties, catalogueId: { type: 'string', enum: catalogue.map((c) => c.id) } } } },
      },
    },
  };
}

export function cataloguePrompt(catalogue: CatalogueEntry[]): string {
  if (catalogue.length === 0) return '';
  const lines = catalogue.map((c) => `${c.id} | ${c.name} | per ${c.unit}${c.specs.length ? ` | sizes: ${c.specs.join(', ')}` : ''}`);
  return `\n\nSTANDARD PARTS CATALOGUE. Shops price parts from this list. For every part you ask for, if an item below is the right part, set parts[].catalogueId to its id, set name to that item's name, and put the exact size/variant from its sizes list in spec when one fits (for example "20mm", "1/2\""). Only use an id when it is genuinely the right part; never force a match. If nothing fits, leave catalogueId out and describe the part in plain words as before. Format: id | name | unit | sizes\n${lines.join('\n')}`;
}

// Enforced in code, not trusted: an id the catalogue does not have is dropped (and the free-text name still goes to the shops).
export function normaliseParts(parts: Diagnosis['parts'], catalogue: CatalogueEntry[]): Diagnosis['parts'] {
  const known = new Set(catalogue.map((c) => c.id));
  return parts.map((p) => {
    if (p.catalogueId && known.has(p.catalogueId)) return p;
    const { catalogueId: _drop, ...rest } = p;
    return rest;
  });
}

export interface DiagnosisInput {
  images: { base64: string; mediaType: 'image/jpeg' }[];
  note?: string;
  location?: string;
  trade?: DiagnosisTrade; // default PLUMBING
}

// Enforced in code so a model slip cannot hand out step-by-step instructions for a dangerous job or invent parts.
export function applySafetyRules(d: Diagnosis, ctx: { trade?: DiagnosisTrade; note?: string } = {}): Diagnosis {
  const out: Diagnosis = { ...d, safety: { ...d.safety } };
  if (out.outcome !== 'DIAGNOSED') {
    out.parts = [];
    out.tools = [];
    out.steps = [];
    out.checks = [];
    out.estimatedMinutes = undefined;
    if (out.outcome === 'NEEDS_MORE_PHOTOS' && out.photoRequests.length === 0) out.photoRequests = ['A closer, well-lit photo of the fault', 'A wider photo showing the whole fixture or pipe run'];
  }
  if (ctx.trade) tradeConfig(ctx.trade).rules?.(out, ctx.note ?? '');
  if (out.safety.escalate || out.safety.level === 'STOP') {
    out.safety.escalate = true;
    out.safety.level = 'STOP';
    out.steps = [];
    if (out.safety.warnings.length === 0) out.safety.warnings = ['This job needs a qualified person. Do not continue.'];
  }
  if (out.confidence === 'LOW' && out.safety.level === 'NORMAL') out.safety.level = 'CAUTION';
  return out;
}

export class DiagnosisUnavailable extends Error {}

export async function runPlumbingDiagnosis(input: DiagnosisInput, fetchImpl: typeof fetch = fetch, catalogue: CatalogueEntry[] = []): Promise<{ diagnosis: Diagnosis; model: string }> {
  const trade: DiagnosisTrade = input.trade ?? 'PLUMBING';
  const cfg = tradeConfig(trade);
  if (env.mockMode) return { diagnosis: applySafetyRules(cfg.mock(input), { trade, note: input.note }), model: 'mock' };
  if (!env.ai.anthropicApiKey) throw new DiagnosisUnavailable('AI is not configured');
  const model = env.diagnose.model;
  const text =
    `Location: ${input.location || 'Nigeria'}\n` +
    (input.note ? `${cfg.noteLabel} note (untrusted text):\n"""${input.note}"""\n` : 'No note.\n') +
    `${input.images.length} photo(s) attached. Diagnose the problem.`;
  const res = await fetchImpl(`${env.ai.anthropicBaseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ai.anthropicApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 2200,
      system: cfg.system + cataloguePrompt(catalogue),
      tools: [catalogueTool(catalogue, trade)],
      tool_choice: { type: 'tool', name: BASE_TOOL.name },
      messages: [{ role: 'user', content: [...input.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } })), { type: 'text', text }] }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new DiagnosisUnavailable(`model returned ${res.status}`);
  const data = (await res.json()) as { content?: { type: string; input?: unknown }[] };
  const raw = data.content?.find((c) => c.type === 'tool_use')?.input;
  const parsed = diagnosisSchema.safeParse(raw);
  if (!parsed.success) throw new DiagnosisUnavailable('model output failed validation');
  return { diagnosis: applySafetyRules({ ...parsed.data, parts: normaliseParts(parsed.data.parts, catalogue) }, { trade, note: input.note }), model };
}

