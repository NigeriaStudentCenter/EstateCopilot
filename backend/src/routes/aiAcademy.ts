import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { enrolLearner } from '../services/aiAcademy/provision.js';

// AI Academy on Wheels enrolment intake.
//
// The "AI Academy Enrolment" Microsoft Form has a one-step Power Automate
// flow: "When a new response is submitted" -> "Get response details" ->
// HTTP POST here with the form fields and the shared secret. This route
// hands off to the Graph provisioning in services/aiAcademy/provision.ts
// and returns a per-step report so the flow can surface a partial failure.
//
// Off unless AI_ACADEMY_ENROL_SECRET is set (like the landlord admin routes).

export const aiAcademyRouter = Router();

const enrolSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  personalEmail: z.string().email(),
  phone: z.string().max(40).optional(),
  programme: z.enum(['university', 'professional']),
  organisation: z.string().max(200).optional(),
  country: z.string().max(80).optional(),
  startMonth: z.string().max(40).optional(),
});

aiAcademyRouter.post('/ai-academy/enrol', async (req, res) => {
  if (!env.aiAcademyEnrol.secret) return res.sendStatus(404);
  if (req.get('x-enrol-secret') !== env.aiAcademyEnrol.secret) {
    return res.status(401).json({ error: 'bad enrol secret' });
  }

  const parsed = enrolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const report = await enrolLearner(parsed.data);
  // Always 200 — the report says what worked. A non-2xx would make the flow
  // retry the whole thing and double-provision.
  res.status(200).json(report);
});
