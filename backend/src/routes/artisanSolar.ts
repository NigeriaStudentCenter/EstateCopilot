import { Router, type Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireArtisanAuth, type ArtisanAuthedRequest } from './artisan.js';
import { mockArtisans } from '../lib/mockArtisans.js';
import { readApplianceLabel, LabelUnavailable } from '../lib/solarLabel.js';

export const artisanSolarRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.storage.maxImageBytes, files: 1 } });
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']);

// Cost guard: scans per artisan per rolling 24h. In memory on purpose (a restart only resets the allowance).
const scans = new Map<string, number[]>();
function allowScan(id: string): boolean {
  const now = Date.now();
  const recent = (scans.get(id) ?? []).filter((t) => now - t < 24 * 3600 * 1000);
  if (recent.length >= env.solar.scanDailyLimit) { scans.set(id, recent); return false; }
  recent.push(now);
  scans.set(id, recent);
  return true;
}

async function who(artisanId: string) {
  if (env.mockMode) return mockArtisans.get(artisanId) ?? null;
  return prisma.artisan.findUnique({ where: { id: artisanId }, include: { trades: true } });
}

// The sizing tool is for solar & inverter installers. The calculation itself runs on the phone; only the label photo
// reading needs the server.
artisanSolarRouter.post(
  '/artisan/me/solar/scan-label',
  requireArtisanAuth,
  (req: ArtisanAuthedRequest, res: Response, next) => {
    upload.single('image')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `The photo must be under ${Math.round(env.storage.maxImageBytes / (1024 * 1024))} MB` : `Upload rejected: ${err.message}` });
      if (err) return next(err);
      next();
    });
  },
  async (req: ArtisanAuthedRequest, res: Response) => {
    const artisanId = req.artisan!.artisanId;
    const a = await who(artisanId);
    if (!a) return res.status(404).json({ error: 'Account not found' });
    const trades = (a as { trades?: { trade: string }[] }).trades ?? [];
    if (!trades.some((t) => t.trade === 'SOLAR_INVERTER')) return res.status(403).json({ error: 'Add Solar & inverter to your trades on the Profile tab to use the sizing tool.' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Add a photo of the label (field "image").' });
    if (!ALLOWED_MIME.has(file.mimetype)) return res.status(400).json({ error: 'Only JPEG, PNG, WebP, HEIC or AVIF photos are allowed.' });
    if (!allowScan(artisanId)) return res.status(429).json({ error: `You have used today's ${env.solar.scanDailyLimit} label scans. Add the appliance by hand, or try again tomorrow.` });

    let jpeg: Buffer;
    try {
      // Labels are small print: keep more resolution than a diagnosis photo. Re-encoding also strips EXIF/GPS.
      jpeg = await sharp(file.buffer).rotate().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    } catch {
      return res.status(400).json({ error: "We couldn't read that photo. Try taking it again." });
    }
    try {
      return res.json(await readApplianceLabel(jpeg.toString('base64')));
    } catch (e) {
      if (!(e instanceof LabelUnavailable)) console.error('[solar] unexpected', e);
      return res.status(503).json({ error: "We couldn't read that label right now. Add the appliance by hand, or try again in a moment." });
    }
  },
);
