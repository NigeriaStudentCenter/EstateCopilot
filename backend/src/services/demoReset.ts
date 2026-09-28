import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { demoLandlordIds } from '../lib/demo.js';

// Nightly reset of the shared demo landlord. The first run (or POST
// /api/admin/demo/snapshot) records how the demo data should look; every night
// after that, anything testers added is removed and anything they changed is
// put back. Only the demo landlord's own rows are ever touched.

interface Snapshot {
  landlord: { name: string; phone: string; state: string; email?: string; passwordHash?: string | null; subscriptionStatus?: string };
  properties: Array<Record<string, unknown> & { id: string }>;
  tickets: Array<{ id: string; status: string; openToMarketplace: boolean; artisanName: string | null; artisanPhone: string | null; tenantSignedOff: boolean; proofPhotoUrls: string[]; resolvedAt: string | null }>;
  quotes: Array<{ id: string; status: string }>;
  levies: Array<{ id: string; status: string; clearedAt: string | null }>;
}

const PROPERTY_FIELDS = [
  'title', 'address', 'state', 'lga', 'propertyType', 'rentAmount', 'nightlyRate', 'weeklyRate', 'monthlyRate',
  'stayUnitType', 'studentFriendly', 'nearUniversity', 'maxGuests', 'amenities',
  'cautionDepositAmount', 'municipalId', 'discoProvider', 'meterNumber', 'isAdvertised',
  'listingDescription', 'imageUrls', 'agentsAllowed', 'agentFeePercent',
] as const;

export async function takeDemoSnapshot(landlordId: string): Promise<Snapshot> {
  const landlord = await prisma.landlord.findUniqueOrThrow({ where: { id: landlordId } });
  const properties = await prisma.property.findMany({ where: { landlordId } });
  const propertyIds = properties.map((p) => p.id);
  const tickets = await prisma.maintenanceTicket.findMany({ where: { propertyId: { in: propertyIds } } });
  const quotes = await prisma.repairQuote.findMany({ where: { maintenanceTicketId: { in: tickets.map((t) => t.id) } } });
  const levies = await prisma.levy.findMany({ where: { propertyId: { in: propertyIds } } });

  const data: Snapshot = {
    // Identity too, so a deleted (anonymised) demo account can be restored.
    landlord: {
      name: landlord.name,
      phone: landlord.phone,
      state: landlord.state,
      email: landlord.email,
      passwordHash: landlord.passwordHash,
      subscriptionStatus: landlord.subscriptionStatus,
    },
    properties: properties.map((p) => {
      const row: Record<string, unknown> & { id: string } = { id: p.id };
      for (const f of PROPERTY_FIELDS) row[f] = (p as any)[f];
      return row;
    }),
    tickets: tickets.map((t) => ({
      id: t.id, status: t.status, openToMarketplace: t.openToMarketplace, artisanName: t.artisanName,
      artisanPhone: t.artisanPhone, tenantSignedOff: t.tenantSignedOff, proofPhotoUrls: t.proofPhotoUrls,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
    })),
    quotes: quotes.map((q) => ({ id: q.id, status: q.status })),
    levies: levies.map((l) => ({ id: l.id, status: l.status, clearedAt: l.clearedAt?.toISOString() ?? null })),
  };
  await prisma.demoSnapshot.upsert({
    where: { landlordId },
    create: { landlordId, data: data as any },
    update: { data: data as any, takenAt: new Date() },
  });
  return data;
}

async function deleteTickets(ticketIds: string[]) {
  if (!ticketIds.length) return;
  const quoteIds = (await prisma.repairQuote.findMany({ where: { maintenanceTicketId: { in: ticketIds } }, select: { id: true } })).map((q) => q.id);
  await prisma.artisanJobPayment.deleteMany({ where: { quoteId: { in: quoteIds } } });
  await prisma.repairQuote.deleteMany({ where: { id: { in: quoteIds } } });
  await prisma.booking.deleteMany({ where: { maintenanceTicketId: { in: ticketIds } } });
  await prisma.maintenanceTicket.deleteMany({ where: { id: { in: ticketIds } } });
}

export async function resetDemoLandlord(landlordId: string): Promise<Record<string, number>> {
  const snap = await prisma.demoSnapshot.findUnique({ where: { landlordId } });
  if (!snap) {
    await takeDemoSnapshot(landlordId);
    return { snapshotTaken: 1 };
  }
  const data = snap.data as unknown as Snapshot;
  const counts: Record<string, number> = {};
  const keepProps = new Set(data.properties.map((p) => p.id));

  // Properties testers added (only if nothing real hangs off them).
  const added = await prisma.property.findMany({
    where: { landlordId, id: { notIn: [...keepProps] } },
    select: { id: true, _count: { select: { tenancies: true } } },
  });
  for (const p of added.filter((x) => x._count.tenancies === 0)) {
    const ticketIds = (await prisma.maintenanceTicket.findMany({ where: { propertyId: p.id }, select: { id: true } })).map((t) => t.id);
    await deleteTickets(ticketIds);
    await prisma.booking.deleteMany({ where: { propertyId: p.id } });
    await prisma.agentDeal.deleteMany({ where: { propertyId: p.id } });
    await prisma.levy.deleteMany({ where: { propertyId: p.id } });
    await prisma.property.delete({ where: { id: p.id } });
    counts.propertiesRemoved = (counts.propertiesRemoved ?? 0) + 1;
  }

  // Put property details back.
  for (const p of data.properties) {
    const { id, ...fields } = p;
    await prisma.property.updateMany({ where: { id, landlordId }, data: fields as any });
  }
  const propertyIds = [...keepProps];

  // Repairs: remove new ones, restore the originals and their quotes.
  const keepTickets = new Set(data.tickets.map((t) => t.id));
  const newTickets = (await prisma.maintenanceTicket.findMany({
    where: { propertyId: { in: propertyIds }, id: { notIn: [...keepTickets] } },
    select: { id: true },
  })).map((t) => t.id);
  await deleteTickets(newTickets);
  counts.repairsRemoved = newTickets.length;
  for (const t of data.tickets) {
    const { id, resolvedAt, ...rest } = t;
    await prisma.maintenanceTicket.updateMany({ where: { id }, data: { ...(rest as any), resolvedAt: resolvedAt ? new Date(resolvedAt) : null } });
  }
  const keepQuotes = new Set(data.quotes.map((q) => q.id));
  const newQuotes = (await prisma.repairQuote.findMany({
    where: { maintenanceTicketId: { in: [...keepTickets] }, id: { notIn: [...keepQuotes] } },
    select: { id: true },
  })).map((q) => q.id);
  await prisma.artisanJobPayment.deleteMany({ where: { quoteId: { in: [...newQuotes, ...keepQuotes] } } });
  await prisma.repairQuote.deleteMany({ where: { id: { in: newQuotes } } });
  for (const q of data.quotes) await prisma.repairQuote.updateMany({ where: { id: q.id }, data: { status: q.status as any } });

  // Levies.
  const keepLevies = new Set(data.levies.map((l) => l.id));
  counts.leviesRemoved = (await prisma.levy.deleteMany({ where: { propertyId: { in: propertyIds }, id: { notIn: [...keepLevies] } } })).count;
  for (const l of data.levies) {
    await prisma.levy.updateMany({ where: { id: l.id }, data: { status: l.status as any, clearedAt: l.clearedAt ? new Date(l.clearedAt) : null } });
  }

  // Messages, viewing requests and agent deals created since the snapshot.
  const tenancyIds = (await prisma.tenancy.findMany({ where: { propertyId: { in: propertyIds } }, select: { id: true } })).map((t) => t.id);
  counts.messagesRemoved = (await prisma.correspondence.deleteMany({ where: { tenancyId: { in: tenancyIds }, createdAt: { gt: snap.takenAt } } })).count;
  await prisma.correspondenceDraft.deleteMany({ where: { tenancyId: { in: tenancyIds }, createdAt: { gt: snap.takenAt } } });
  counts.bookingsRemoved = (await prisma.booking.deleteMany({ where: { propertyId: { in: propertyIds }, createdAt: { gt: snap.takenAt } } })).count;
  await prisma.agentDeal.deleteMany({ where: { propertyId: { in: propertyIds }, createdAt: { gt: snap.takenAt } } });

  // Password: keep the current one if the account still has it (so a password
  // set after the snapshot is never wiped); fall back to the snapshot's copy
  // only when the account was deleted (which nulls it). Remember whichever
  // is kept, so a later deletion can still be undone.
  const { subscriptionStatus, passwordHash: snapHash, ...identity } = data.landlord;
  const current = await prisma.landlord.findUnique({ where: { id: landlordId }, select: { passwordHash: true } });
  const passwordHash = current?.passwordHash ?? snapHash ?? null;
  await prisma.landlord.update({
    where: { id: landlordId },
    data: { ...identity, passwordHash, ...(subscriptionStatus ? { subscriptionStatus: subscriptionStatus as any } : {}) },
  });
  if (passwordHash && passwordHash !== snapHash) {
    await prisma.demoSnapshot.update({ where: { landlordId }, data: { data: { ...data, landlord: { ...data.landlord, passwordHash } } as any } });
  }
  return counts;
}

export async function resetAllDemoLandlords(): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  // Every snapshotted demo account — including one that was deleted today and
  // no longer has its demo email — plus any demo account not snapshotted yet.
  const snapshotted = (await prisma.demoSnapshot.findMany({ select: { landlordId: true } })).map((s) => s.landlordId);
  const ids = [...new Set([...snapshotted, ...(await demoLandlordIds())])];
  for (const id of ids) {
    try {
      out[id] = await resetDemoLandlord(id);
    } catch (err) {
      console.error(`[demo] reset failed for ${id}`, err);
      out[id] = { failed: 1 };
    }
  }
  return out;
}

/** Checks every 10 minutes; resets once per day at env.demo.resetHourLagos (Lagos = UTC+1). */
export function startDemoResetScheduler() {
  if (env.mockMode || !env.demo.emails.length) return;
  let lastRunDay = '';
  const tick = async () => {
    const lagos = new Date(Date.now() + 60 * 60 * 1000);
    const day = lagos.toISOString().slice(0, 10);
    if (lagos.getUTCHours() !== env.demo.resetHourLagos || day === lastRunDay) return;
    lastRunDay = day;
    const result = await resetAllDemoLandlords();
    console.log('[demo] nightly reset', JSON.stringify(result));
  };
  // First pass shortly after boot takes the snapshot if none exists yet.
  setTimeout(async () => {
    for (const id of await demoLandlordIds()) {
      const has = await prisma.demoSnapshot.findUnique({ where: { landlordId: id } });
      if (!has) {
        await takeDemoSnapshot(id).catch((err) => console.error('[demo] snapshot failed', err));
        console.log(`[demo] snapshot taken for ${id}`);
      }
    }
  }, 30_000);
  setInterval(() => void tick().catch((err) => console.error('[demo] tick failed', err)), 10 * 60 * 1000);
}
