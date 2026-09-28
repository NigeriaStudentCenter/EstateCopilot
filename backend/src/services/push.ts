import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

// Push notifications to the EstateCopilot mobile app via Apple Push
// Notification service (token-based auth). Off until APNS_KEY_ID and
// APNS_PRIVATE_KEY (the .p8 key, base64) are set — then every call is a no-op
// that just logs, so nothing breaks while it's unconfigured.
//
// Settings: APNS_KEY_ID, APNS_TEAM_ID (default 34W472R2XX), APNS_PRIVATE_KEY
// (base64 of the .p8), APNS_BUNDLE_ID (default org.estatecopilot.app),
// APNS_PRODUCTION=1 for App Store / TestFlight builds (sandbox otherwise).

export type PushRole = 'landlord' | 'tenant' | 'artisan';

export interface PushMessage {
  title: string;
  body: string;
  /** Screen hint for the app, e.g. "repairs", "jobs", "home". */
  screen?: string;
}

const KEY_ID = process.env.APNS_KEY_ID ?? '';
const TEAM_ID = process.env.APNS_TEAM_ID ?? '34W472R2XX';
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? 'org.estatecopilot.app';
const PRIVATE_KEY = process.env.APNS_PRIVATE_KEY
  ? Buffer.from(process.env.APNS_PRIVATE_KEY, 'base64').toString('utf8')
  : '';
const HOST = process.env.APNS_PRODUCTION === '1' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';

export const pushConfigured = (): boolean => !!(KEY_ID && PRIVATE_KEY);

// In mock mode (no database) devices are kept in memory.
const mockDevices = new Map<string, { token: string; platform: string; role: PushRole; accountId: string }>();

export async function registerDevice(token: string, platform: string, role: PushRole, accountId: string): Promise<void> {
  if (env.mockMode) {
    mockDevices.set(token, { token, platform, role, accountId });
    return;
  }
  await prisma.pushDevice.upsert({
    where: { token },
    create: { token, platform, role, accountId },
    update: { platform, role, accountId },
  });
}

export async function forgetDevicesFor(role: PushRole, accountId: string): Promise<void> {
  if (env.mockMode) {
    for (const [k, d] of mockDevices) if (d.role === role && d.accountId === accountId) mockDevices.delete(k);
    return;
  }
  await prisma.pushDevice.deleteMany({ where: { role, accountId } });
}

async function devicesFor(role: PushRole, accountId: string) {
  if (env.mockMode) return [...mockDevices.values()].filter((d) => d.role === role && d.accountId === accountId);
  return prisma.pushDevice.findMany({ where: { role, accountId } });
}

// APNs provider tokens are valid for up to an hour; reuse one for 50 minutes.
let cachedJwt: { token: string; at: number } | null = null;
function providerToken(): string {
  if (!cachedJwt || Date.now() - cachedJwt.at > 50 * 60 * 1000) {
    const token = jwt.sign({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }, PRIVATE_KEY, {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: KEY_ID },
    });
    cachedJwt = { token, at: Date.now() };
  }
  return cachedJwt.token;
}

function sendOne(deviceToken: string, msg: PushMessage): Promise<number> {
  return new Promise((resolve) => {
    const client = http2.connect(HOST);
    client.on('error', () => resolve(0));
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });
    let status = 0;
    req.on('response', (h) => (status = Number(h[':status'])));
    req.on('end', () => {
      client.close();
      resolve(status);
    });
    req.on('error', () => {
      client.close();
      resolve(0);
    });
    req.setEncoding('utf8');
    req.on('data', () => undefined);
    req.end(JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' }, screen: msg.screen ?? '' }));
  });
}

/**
 * Notify every device signed in as this account. Never throws — a failed
 * push must not break the request that triggered it.
 */
export async function notify(role: PushRole, accountId: string | undefined | null, msg: PushMessage): Promise<void> {
  if (!accountId) return;
  try {
    const devices = await devicesFor(role, accountId);
    if (!devices.length) return;
    if (!pushConfigured()) {
      console.log(`[push] (not configured) ${role}:${accountId} — ${msg.title}`);
      return;
    }
    for (const d of devices) {
      if (d.platform !== 'ios') continue;
      const status = await sendOne(d.token, msg);
      // 410 = the app was uninstalled / token no longer valid.
      if (status === 410 || status === 400) {
        if (env.mockMode) mockDevices.delete(d.token);
        else await prisma.pushDevice.deleteMany({ where: { token: d.token } });
      }
    }
  } catch (err) {
    console.error('[push] notify failed:', err);
  }
}
