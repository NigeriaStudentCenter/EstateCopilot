import { Router, type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { demoLandlordIds } from '../lib/demo.js';
import { resetAllDemoLandlords, takeDemoSnapshot } from '../services/demoReset.js';

// Operator-only endpoints (x-admin-key = ADMIN_API_KEY). Unset key => 404.
export const adminRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!env.admin.apiKey) return res.sendStatus(404);
  if (req.get('x-admin-key') !== env.admin.apiKey) return res.status(401).json({ error: 'Bad admin key' });
  next();
}

adminRouter.use('/admin', requireAdmin);

// Save the demo landlord's current data as the version the nightly reset
// restores — run this after deliberately changing the demo data.
adminRouter.post('/admin/demo/snapshot', async (_req, res) => {
  const ids = await demoLandlordIds();
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const s = await takeDemoSnapshot(id);
    out[id] = { properties: s.properties.length, repairs: s.tickets.length, quotes: s.quotes.length, levies: s.levies.length };
  }
  res.json({ snapshots: out });
});

// Reset the demo now instead of waiting for the night.
adminRouter.post('/admin/demo/reset', async (_req, res) => {
  res.json({ reset: await resetAllDemoLandlords() });
});
