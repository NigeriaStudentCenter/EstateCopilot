import { Router } from 'express';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    name: 'EstateCopilot backend',
    mockMode: env.mockMode,
    endpoints: [
      'GET  /health',
      'GET  /api/properties',
      'GET  /api/tenancies',
      'POST /api/tenancies/:id/send-rent-reminder',
      'GET  /api/tenancies/reminders/due',
      'POST /api/tenancies/reminders/run',
      'POST /api/tenancies/:id/payment-plan',
      'GET  /api/tenancies/:id/payment-plan',
      'POST /api/vetting/tenant',
      'POST /api/vetting/guarantor',
      'POST /api/payments/virtual-account',
      'GET  /api/levies/:propertyId',
      'GET  /api/levies/:propertyId/exit-audit',
      'GET  /api/maintenance/checklist',
      'POST /api/maintenance/tickets',
      'GET  /api/maintenance/tickets',
      'PATCH /api/maintenance/tickets/:id/sign-off',
      'GET  /api/correspondence/:tenancyId',
      'POST /api/correspondence/:tenancyId',
      'GET  /api/ai-drafts',
      'POST /api/ai-drafts/:id/approve',
      'POST /api/ai-drafts/:id/reject',
      'POST /api/tenant-auth/signup',
      'POST /api/tenant-auth/login',
      'GET  /api/tenant/me (auth)',
      'GET  /api/tenant/correspondence (auth)',
      'POST /api/tenant/correspondence (auth)',
      'GET  /api/tenant/payment-plan (auth)',
      'GET  /api/tenant/maintenance (auth)',
      'POST /api/tenant/maintenance (auth)',
      'PATCH /api/properties/:id',
      'PATCH /api/maintenance/tickets/:id/marketplace',
      'GET  /api/maintenance/tickets/:id/quotes',
      'PATCH /api/maintenance/quotes/:id/accept',
      'GET  /api/bookings',
      'PATCH /api/bookings/:id',
      'GET  /api/public/properties',
      'GET  /api/public/properties/:id',
      'POST /api/public/properties/:id/book-viewing',
      'GET  /api/public/repair-jobs',
      'GET  /api/public/repair-jobs/:id',
      'POST /api/public/repair-jobs/:id/quote',
      'POST /api/public/repair-jobs/:id/book-viewing',
      'POST /api/landlord-auth/signup',
      'POST /api/landlord-auth/confirm',
      'POST /api/landlord-auth/login',
      'GET  /api/landlord/me (auth, active subscription)',
      'GET  /webhooks/whatsapp (verify)',
      'POST /webhooks/whatsapp (receive)',
    ],
  });
});

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mockMode: env.mockMode,
    time: new Date().toISOString(),
  });
});
