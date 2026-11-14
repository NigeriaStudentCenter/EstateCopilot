import { z } from 'zod';

// Structured result of a photo diagnosis (any trade). The model is forced to return this through a tool call, then it is
// validated here, then the SAFETY RULES below are applied in code (not left to the prompt alone).
export const diagnosisSchema = z.object({
  outcome: z.enum(['DIAGNOSED', 'NEEDS_MORE_PHOTOS', 'NOT_PLUMBING', 'NOT_ELECTRICAL', 'NOT_CARPENTRY', 'NOT_SOLAR', 'NOT_BUILDING', 'NOT_HVAC']),
  summary: z.string().min(1).max(400),
  summaryPidgin: z.string().max(400).optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  fixture: z.string().max(120),
  material: z.string().max(120).optional(),
  defect: z.string().max(300),
  alternativeCauses: z.array(z.string().max(200)).max(4).default([]),
  urgency: z.enum(['URGENT', 'SOON', 'ROUTINE']),
  immediateAction: z.string().max(300).optional(),
  safety: z.object({
    level: z.enum(['NORMAL', 'CAUTION', 'STOP']),
    warnings: z.array(z.string().max(240)).max(6),
    escalate: z.boolean(),
  }),
  tools: z.array(z.string().max(80)).max(15),
  parts: z
    .array(z.object({ name: z.string().max(100), spec: z.string().max(120).optional(), qty: z.number().int().min(1).max(100), unit: z.string().max(20).optional(), note: z.string().max(160).optional(), catalogueId: z.string().max(60).optional() }))
    .max(15),
  steps: z.array(z.string().max(300)).max(14),
  checks: z.array(z.string().max(240)).max(8).optional(), // tests/measurements to take (electrical: live ones start with "LIVE TEST:"; carpentry: sizes to measure)
  estimatedMinutes: z.number().int().min(5).max(960).optional(),
  photoRequests: z.array(z.string().max(160)).max(4).default([]),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;
export type DiagnosisTrade = 'PLUMBING' | 'ELECTRICAL' | 'CARPENTRY' | 'SOLAR' | 'BUILDING' | 'HVAC';

export const str = (max: number) => ({ type: 'string', maxLength: max });
export const BASE_TOOL = {
  name: 'report_diagnosis',
  description: 'Report the plumbing diagnosis for the photo(s). Always call this tool exactly once.',
  input_schema: {
    type: 'object',
    required: ['outcome', 'summary', 'confidence', 'fixture', 'defect', 'urgency', 'safety', 'tools', 'parts', 'steps'],
    properties: {
      outcome: { type: 'string', enum: ['DIAGNOSED', 'NEEDS_MORE_PHOTOS', 'NOT_PLUMBING'] },
      summary: str(400),
      summaryPidgin: str(400),
      confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
      fixture: str(120),
      material: str(120),
      defect: str(300),
      alternativeCauses: { type: 'array', maxItems: 4, items: str(200) },
      urgency: { type: 'string', enum: ['URGENT', 'SOON', 'ROUTINE'] },
      immediateAction: str(300),
      safety: {
        type: 'object',
        required: ['level', 'warnings', 'escalate'],
        properties: { level: { type: 'string', enum: ['NORMAL', 'CAUTION', 'STOP'] }, warnings: { type: 'array', maxItems: 6, items: str(240) }, escalate: { type: 'boolean' } },
      },
      tools: { type: 'array', maxItems: 15, items: str(80) },
      parts: {
        type: 'array',
        maxItems: 15,
        items: { type: 'object', required: ['name', 'qty'], properties: { name: str(100), spec: str(120), qty: { type: 'integer', minimum: 1, maximum: 100 }, unit: str(20), note: str(160) } },
      },
      steps: { type: 'array', maxItems: 14, items: str(300) },
      estimatedMinutes: { type: 'integer', minimum: 5, maximum: 960 },
      photoRequests: { type: 'array', maxItems: 4, items: str(160) },
    },
  },
};

