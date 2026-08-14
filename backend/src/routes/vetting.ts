import { Router } from 'express';
import { z } from 'zod';
import { verifyNinBvn } from '../services/smileId.js';
import { assessBankStatementRisk } from '../services/mono.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';
import { requireLandlordAuth } from './landlordAuth.js';

export const vettingRouter = Router();
vettingRouter.use('/vetting', requireLandlordAuth);

const vettingSchema = z.object({
  fullName: z.string().min(3),
  nin: z.string().optional(),
  bvn: z.string().optional(),
});

// Pillar A: NIN/BVN identity + bank-statement risk check, triggered when a
// prospective tenant submits documents (typically via the WhatsApp intake flow).
vettingRouter.post('/vetting/tenant', async (req, res) => {
  const parsed = vettingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { fullName, nin, bvn } = parsed.data;

  const identity = await verifyNinBvn({ nin, bvn, fullName });
  const risk = bvn ? await assessBankStatementRisk(bvn) : undefined;

  res.json({
    identity,
    risk,
    overallStatus: identity.status === 'VERIFIED' && (!risk || risk.riskScore < 50) ? 'VERIFIED' : 'FAILED',
  });
});

const guarantorSchema = z.object({
  guarantorName: z.string().min(3),
  guarantorPhone: z.string().min(10),
  tenantName: z.string().min(3),
});

// Pillar A: fires an automated WhatsApp consent + identity request to the guarantor.
vettingRouter.post('/vetting/guarantor', async (req, res) => {
  const parsed = guarantorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { guarantorName, guarantorPhone, tenantName } = parsed.data;

  const result = await sendWhatsAppMessage(
    guarantorPhone,
    `Hi ${guarantorName}, ${tenantName} listed you as a guarantor for a tenancy application. ` +
      `Reply YES to confirm you know them and consent to being their guarantor, or STOP to decline.`,
  );

  res.json({ requestSent: result.sent, messageId: result.id });
});
