// Where property photos live. Two backends behind one interface:
//   - AZURE_STORAGE_CONNECTION_STRING set -> Azure Blob Storage (production)
//   - unset -> backend/uploads/, served by express.static (local dev / mock)
// The rest of the app only sees a public URL string.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const LOCAL_DIR = path.resolve(process.cwd(), 'uploads', 'property-images');
const LOCAL_PREFIX = '/uploads/property-images/';

let containerClientPromise: Promise<import('@azure/storage-blob').ContainerClient> | null = null;

async function getContainer() {
  if (!containerClientPromise) {
    containerClientPromise = (async () => {
      const { BlobServiceClient } = await import('@azure/storage-blob');
      const svc = BlobServiceClient.fromConnectionString(env.storage.connectionString!);
      const container = svc.getContainerClient(env.storage.container);
      // Public read on blobs so <img src> works without a SAS token. Property
      // photos are marketing material shown on the public listings page anyway.
      await container.createIfNotExists({ access: 'blob' });
      return container;
    })();
  }
  return containerClientPromise;
}

export interface StoredImage {
  url: string;
  key: string; // blob name / local filename — kept so we can delete it later
}

/** Store one already-processed JPEG buffer, return its public URL. */
export async function putPropertyImage(buffer: Buffer): Promise<StoredImage> {
  const key = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.jpg`;

  if (env.storage.connectionString) {
    const container = await getContainer();
    const blob = container.getBlockBlobClient(key);
    await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } });
    return { url: blob.url, key };
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, key), buffer);
  return { url: `${env.storage.publicApiUrl}${LOCAL_PREFIX}${key}`, key };
}

/** Best-effort delete of an image we previously stored. Ignores anything that
 *  isn't one of ours (e.g. a pasted third-party URL) and any not-found error. */
export async function deletePropertyImage(url: string): Promise<void> {
  try {
    if (env.storage.connectionString) {
      const container = await getContainer();
      const prefix = container.url.replace(/\/$/, '') + '/';
      if (!url.startsWith(prefix)) return;
      const key = decodeURIComponent(url.slice(prefix.length).split('?')[0]);
      await container.getBlockBlobClient(key).deleteIfExists();
      return;
    }
    const marker = LOCAL_PREFIX;
    const at = url.indexOf(marker);
    if (at === -1) return;
    const key = path.basename(url.slice(at + marker.length).split('?')[0]);
    await fs.rm(path.join(LOCAL_DIR, key), { force: true });
  } catch {
    /* orphaned blob is harmless — never fail the request over cleanup */
  }
}

/** True if this URL points at our own store (vs a pasted external URL). */
export function isOwnImage(url: string): boolean {
  if (env.storage.connectionString) return url.includes(`/${env.storage.container}/`);
  return url.includes(LOCAL_PREFIX);
}

export const localUploadsMount = { route: '/uploads', dir: path.resolve(process.cwd(), 'uploads') };
