import { Router, type Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { MOCK_PROPERTIES, type MockProperty } from '../lib/mockProperties.js';
import { requireLandlordAuth, type LandlordAuthedRequest } from './landlordAuth.js';
import { putPropertyImage, deletePropertyImage } from '../lib/blobStorage.js';

export const propertiesRouter = Router();

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
]);

// Memory storage (buffers, never touches disk) — every file is re-encoded by
// sharp before it's stored, so the original bytes never leave this process.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.storage.maxImageBytes,
    files: env.storage.maxImagesPerProperty,
  },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME.has(file.mimetype));
  },
});

async function loadOwnedProperty(landlordId: string, id: string) {
  if (env.mockMode) {
    return MOCK_PROPERTIES.find((p) => p.id === id && p.landlordId === landlordId) ?? null;
  }
  return prisma.property.findFirst({ where: { id, landlordId } });
}

async function saveImageUrls(id: string, landlordId: string, imageUrls: string[]) {
  if (env.mockMode) {
    const p = MOCK_PROPERTIES.find((x) => x.id === id && x.landlordId === landlordId);
    if (p) p.imageUrls = imageUrls;
    return p;
  }
  return prisma.property.update({ where: { id }, data: { imageUrls } });
}
// Scoped to '/properties' specifically, not a blanket router-level `.use()`
// — an unscoped one would swallow requests for any other router mounted
// after this one at the same '/api' prefix (see routes/tenantPortal.ts for
// the earlier bug this pattern avoids).
propertiesRouter.use('/properties', requireLandlordAuth);

// Every route below is scoped to req.landlord.landlordId — a landlord can
// only ever see or mutate their own properties, never another landlord's.
// A property that exists but belongs to someone else 404s, same as one that
// doesn't exist at all, so probing IDs reveals nothing.

propertiesRouter.get('/properties', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    return res.json(MOCK_PROPERTIES.filter((p) => p.landlordId === landlordId));
  }
  const properties = await prisma.property.findMany({ where: { landlordId } });
  res.json(properties);
});

propertiesRouter.get('/properties/:id', async (req: LandlordAuthedRequest, res) => {
  const landlordId = req.landlord!.landlordId;
  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id && p.landlordId === landlordId);
    return property ? res.json(property) : res.status(404).json({ error: 'Not found' });
  }
  const property = await prisma.property.findFirst({
    where: { id: req.params.id, landlordId },
    include: { tenancies: true, levies: true },
  });
  return property ? res.json(property) : res.status(404).json({ error: 'Not found' });
});

const createSchema = z.object({
  title: z.string().min(2),
  address: z.string().min(4),
  state: z.string().min(2),
  lga: z.string().min(2),
  propertyType: z.enum(['LONG_TERM', 'SHORT_LET']),
  rentAmount: z.number().int().positive(),
  cautionDepositAmount: z.number().int().min(0),
  municipalId: z.string().optional(),
});

// Lets a landlord add their own property — the piece that was missing
// before: without this, every property a landlord could see was one of the
// pre-seeded demo ones, never something they created themselves.
propertiesRouter.post('/properties', async (req: LandlordAuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const property: MockProperty = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      landlordId,
      ...parsed.data,
      isAdvertised: false,
      imageUrls: [],
    };
    MOCK_PROPERTIES.push(property);
    return res.status(201).json(property);
  }

  const property = await prisma.property.create({ data: { ...parsed.data, landlordId } });
  res.status(201).json(property);
});

const updateSchema = z.object({
  isAdvertised: z.boolean().optional(),
  listingDescription: z.string().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(),
});

// Toggling isAdvertised is what actually publishes/unpublishes a property on
// the public marketing site's listings page (see routes/public.ts).
propertiesRouter.patch('/properties/:id', async (req: LandlordAuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const landlordId = req.landlord!.landlordId;

  if (env.mockMode) {
    const property = MOCK_PROPERTIES.find((p) => p.id === req.params.id && p.landlordId === landlordId);
    if (!property) return res.status(404).json({ error: 'Not found' });
    Object.assign(property, parsed.data);
    return res.json(property);
  }

  const owned = await prisma.property.findFirst({ where: { id: req.params.id, landlordId } });
  if (!owned) return res.status(404).json({ error: 'Not found' });
  const property = await prisma.property.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(property);
});

// ---- photo upload -------------------------------------------------------
// Accepts one or more image files (multipart, field name "images"), re-encodes
// each to a web-sized JPEG, stores it, and appends the URL to the property.
// Limits: env.storage.maxImageBytes per file, env.storage.maxImagesPerProperty
// total per property (counting photos already on it).
const MAX_EDGE = 1600; // px — plenty for a listing photo, keeps files small

propertiesRouter.post(
  '/properties/:id/images',
  (req: LandlordAuthedRequest, res: Response, next) => {
    upload.array('images', env.storage.maxImagesPerProperty)(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? `Each image must be under ${Math.round(env.storage.maxImageBytes / (1024 * 1024))} MB`
            : err.code === 'LIMIT_FILE_COUNT'
              ? `You can upload at most ${env.storage.maxImagesPerProperty} images at once`
              : `Upload rejected: ${err.message}`;
        return res.status(400).json({ error: msg });
      }
      if (err) return next(err);
      next();
    });
  },
  async (req: LandlordAuthedRequest, res: Response) => {
    const landlordId = req.landlord!.landlordId;
    const property = await loadOwnedProperty(landlordId, req.params.id);
    if (!property) return res.status(404).json({ error: 'Not found' });

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No image files received (field name must be "images")' });
    }
    if (files.some((f) => !ALLOWED_MIME.has(f.mimetype))) {
      return res.status(400).json({ error: 'Only JPEG, PNG, WebP, HEIC or AVIF images are allowed' });
    }

    const existing = property.imageUrls ?? [];
    const room = env.storage.maxImagesPerProperty - existing.length;
    if (room <= 0) {
      return res.status(400).json({
        error: `This property already has the maximum of ${env.storage.maxImagesPerProperty} photos. Remove one first.`,
      });
    }
    if (files.length > room) {
      return res.status(400).json({
        error: `Only room for ${room} more photo${room === 1 ? '' : 's'} (limit ${env.storage.maxImagesPerProperty}).`,
      });
    }

    try {
      const stored = await Promise.all(
        files.map(async (f) => {
          // auto-rotate from EXIF, downscale, strip metadata (incl. GPS), re-encode
          const jpeg = await sharp(f.buffer)
            .rotate()
            .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          return putPropertyImage(jpeg);
        }),
      );
      const imageUrls = [...existing, ...stored.map((s) => s.url)];
      const updated = await saveImageUrls(property.id, landlordId, imageUrls);
      res.status(201).json(updated ?? { ...property, imageUrls });
    } catch (err) {
      console.error('[properties] image processing/upload failed:', err);
      res.status(422).json({ error: 'Could not process one of those images — try a different photo.' });
    }
  },
);

// Remove one photo by URL. Also deletes the stored blob if it's one of ours.
propertiesRouter.delete('/properties/:id/images', async (req: LandlordAuthedRequest, res: Response) => {
  const parsed = z.object({ url: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide the image url to remove' });

  const landlordId = req.landlord!.landlordId;
  const property = await loadOwnedProperty(landlordId, req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });

  const existing = property.imageUrls ?? [];
  if (!existing.includes(parsed.data.url)) {
    return res.status(404).json({ error: 'That image is not on this property' });
  }
  const imageUrls = existing.filter((u) => u !== parsed.data.url);
  const updated = await saveImageUrls(property.id, landlordId, imageUrls);
  await deletePropertyImage(parsed.data.url); // best-effort
  res.json(updated ?? { ...property, imageUrls });
});
