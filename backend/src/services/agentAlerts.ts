import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { sendEmail } from './email.js';
import { notify } from './push.js';
import { demoLandlordIds } from '../lib/demo.js';

// Every agent alert lands in their dashboard feed (always works) and, when
// they have an email, in their inbox too (once email sending is configured).

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export function listingShareUrl(agentCode: string, propertyId: string): string {
  return `${env.marketplace.listingsUrl}/?agent=${encodeURIComponent(agentCode)}&listing=${encodeURIComponent(propertyId)}`;
}

export async function alertAgent(
  agentId: string,
  alert: { kind: 'NEW_LISTING' | 'NEW_LEAD' | 'DEAL_UPDATE'; title: string; body: string; propertyId?: string },
  email?: { to?: string | null; subject?: string; text: string },
) {
  await prisma.agentAlert.create({ data: { agentId, ...alert } });
  if (email?.to) void sendEmail(email.to, email.subject ?? alert.title, email.text);
}

/**
 * A property just went live on the marketplace: tell every active agent who
 * covers its state. Skips properties whose landlord opted out of agents, and
 * the demo landlord's fictional listings.
 */
export async function alertAgentsOfListing(propertyId: string): Promise<number> {
  if (env.mockMode) return 0;
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || !property.isAdvertised || !property.agentsAllowed) return 0;
  if ((await demoLandlordIds()).includes(property.landlordId)) return 0;

  const agents = await prisma.agent.findMany({
    where: { status: 'ACTIVE', states: { has: property.state } },
    select: { id: true, name: true, email: true, code: true },
  });
  const price =
    property.propertyType === 'SHORT_LET' && property.nightlyRate
      ? `${naira(property.nightlyRate)}/night`
      : `${naira(property.rentAmount)}/year`;
  const fee = property.propertyType === 'LONG_TERM' ? Math.round((property.rentAmount * property.agentFeePercent) / 100) : 0;

  for (const a of agents) {
    const link = a.code ? listingShareUrl(a.code, property.id) : env.marketplace.listingsUrl;
    const body =
      `${property.title} — ${property.lga}, ${property.state}. ${price}.` +
      (fee ? ` Agent fee ${property.agentFeePercent}% (${naira(fee)}).` : '');
    await alertAgent(
      a.id,
      { kind: 'NEW_LISTING', title: `New listing in ${property.state}`, body, propertyId: property.id },
      {
        to: a.email,
        subject: `New listing in ${property.state}: ${property.title}`,
        text:
          `Hi ${a.name.split(' ')[0]},\n\n` +
          `A new property has just been listed in ${property.state}:\n\n` +
          `${property.title}\n${property.address}, ${property.lga}\n${price}\n` +
          (fee ? `Agent fee: ${property.agentFeePercent}% of annual rent (${naira(fee)})\n` : '') +
          `\nShare your personal link with clients — any viewing they request through it comes straight to you:\n${link}\n\n` +
          `Your dashboard: ${env.marketplace.siteUrl}/agents/dashboard\n\nEstateCopilot`,
      },
    );
  }
  return agents.length;
}

/**
 * A repair job was opened to the marketplace: push it to registered artisans
 * based in the same state (the same "alert on publish" model as agents).
 */
export async function alertArtisansOfJob(ticketId: string): Promise<number> {
  if (env.mockMode) return 0;
  const ticket = await prisma.maintenanceTicket.findUnique({ where: { id: ticketId }, include: { property: true } });
  if (!ticket || !ticket.openToMarketplace || ticket.status === 'RESOLVED') return 0;
  if ((await demoLandlordIds()).includes(ticket.property.landlordId)) return 0;
  const artisans = await prisma.artisan.findMany({
    where: { baseState: ticket.property.state, availability: { not: 'AWAY' } },
    select: { id: true },
    take: 500,
  });
  for (const a of artisans) {
    void notify('artisan', a.id, {
      title: `New repair job in ${ticket.property.lga}`,
      body: `${ticket.categoryLabel ?? 'Repair'}: ${ticket.description.slice(0, 120)}`,
      screen: 'jobs',
    });
  }
  return artisans.length;
}
