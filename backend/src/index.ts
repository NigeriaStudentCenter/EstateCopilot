import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { propertiesRouter } from './routes/properties.js';
import { tenanciesRouter } from './routes/tenancies.js';
import { vettingRouter } from './routes/vetting.js';
import { paymentsRouter } from './routes/payments.js';
import { leviesRouter } from './routes/levies.js';
import { maintenanceRouter } from './routes/maintenance.js';
import { correspondenceRouter } from './routes/correspondence.js';
import { aiDraftsRouter } from './routes/aiDrafts.js';
import { tenantAuthRouter } from './routes/tenantAuth.js';
import { tenantPortalRouter } from './routes/tenantPortal.js';
import { landlordAuthRouter } from './routes/landlordAuth.js';
import { publicRouter } from './routes/public.js';
import { bookingsRouter } from './routes/bookings.js';
import { legalRouter } from './routes/legal.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { startCampaignScheduler } from './services/whatsapp/campaignScheduler.js';
import { startAiAcademyPoller } from './services/aiAcademy/poller.js';
import { seedDemoLandlord } from './lib/mockLandlords.js';
import { seedDemoArtisan } from './lib/mockArtisans.js';
import { localUploadsMount } from './lib/blobStorage.js';
import { artisanRouter } from './routes/artisan.js';
import { aiAcademyRouter } from './routes/aiAcademy.js';

if (env.mockMode) {
  seedDemoLandlord();
  seedDemoArtisan();
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true })); // Twilio webhook body

// Property photos when no blob store is configured (local dev / mock) are
// written under backend/uploads and served from here. In production they go to
// Azure Blob Storage and this mount is unused.
if (!env.storage.connectionString) {
  app.use(localUploadsMount.route, express.static(localUploadsMount.dir, { maxAge: '7d', fallthrough: false }));
}

app.use(healthRouter);
app.use('/api', propertiesRouter);
app.use('/api', tenanciesRouter);
app.use('/api', vettingRouter);
app.use('/api', paymentsRouter);
app.use('/api', leviesRouter);
app.use('/api', maintenanceRouter);
app.use('/api', correspondenceRouter);
app.use('/api', aiDraftsRouter);
app.use('/api', tenantAuthRouter);
app.use('/api', tenantPortalRouter);
app.use('/api', landlordAuthRouter);
app.use('/api', publicRouter);
app.use('/api', bookingsRouter);
app.use('/api', legalRouter);
app.use('/api', artisanRouter);
app.use('/api', aiAcademyRouter);
app.use(whatsappRouter); // mounted at root: /webhooks/whatsapp*

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`EstateCopilot backend listening on :${env.port} (MOCK_MODE=${env.mockMode})`);
  // Fires SCHEDULED WhatsApp campaigns when their time passes. Only when the
  // marketing agent is enabled — otherwise the campaign engine is dormant.
  if (env.whatsapp.agentEnabled) {
    startCampaignScheduler(Number(process.env.WA_SCHEDULER_INTERVAL_MS) || 60_000);
  }
  // Polls the AI Academy Enrolments SharePoint list (filled by the Power
  // Automate flow) and provisions each new learner.
  if (env.aiAcademyEnrol.poll) {
    startAiAcademyPoller(env.aiAcademyEnrol.pollIntervalMs);
  }
});
