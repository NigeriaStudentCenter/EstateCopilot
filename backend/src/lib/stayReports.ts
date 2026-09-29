// Check-in / check-out condition reports — shared by the host routes
// (routes/shortLet.ts) and the guest's private booking page
// (routes/stayGuest.ts). Photos are re-encoded to web-sized JPEGs (which also
// strips EXIF/location data) before they're stored.
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { putMedia } from './blobStorage.js';

export const MAX_REPORT_PHOTOS = 12;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_REPORT_PHOTOS },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

export function reportPhotosUpload(req: Request, res: Response, next: NextFunction) {
  upload.array('photos', MAX_REPORT_PHOTOS)(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ error: `Up to ${MAX_REPORT_PHOTOS} photos, each under 10 MB.` });
    next();
  });
}

export const reportItemSchema = z.object({
  area: z.string().trim().min(1).max(60),
  condition: z.enum(['GOOD', 'FAIR', 'DAMAGED']),
  note: z.string().trim().max(300).optional(),
});

// items arrives as a JSON string in multipart forms, or an array in JSON bodies.
export const reportSchema = z.object({
  kind: z.enum(['CHECK_IN', 'CHECK_OUT']),
  items: z.preprocess(
    (v) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v),
    z.array(reportItemSchema).min(1).max(40),
  ),
  notes: z.string().trim().max(1000).optional(),
});

export async function storeReportPhotos(files: Express.Multer.File[] | undefined): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files ?? []) {
    const jpeg = await sharp(f.buffer).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    urls.push((await putMedia(jpeg, 'jpg', 'image/jpeg')).url);
  }
  return urls;
}

export const DEFAULT_REPORT_AREAS = ['Room door & lock', 'Walls & ceiling', 'Floor', 'Bed & mattress', 'Wardrobe / storage', 'Windows & burglary proof', 'Fan / AC', 'Sockets & lighting', 'Bathroom / toilet', 'Kitchen area'];
