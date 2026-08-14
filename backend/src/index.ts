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
import { whatsappRouter } from './routes/whatsapp.js';

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
app.use(whatsappRouter); // mounted at root: /webhooks/whatsapp*

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`EstateCopilot backend listening on :${env.port} (MOCK_MODE=${env.mockMode})`);
});
