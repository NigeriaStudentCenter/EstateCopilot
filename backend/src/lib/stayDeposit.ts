// Caution-fee protection for stays. EstateCopilot collects the deposit with
// the stay payment and holds it — the host never touches it until the return
// is agreed. Rules (StuRents' deposit-protection model, adapted):
//   - host proposes the return after checkout; any deduction needs a reason
//     AND a check-out condition report as evidence
//   - the student has 7 days to accept or dispute; silence = accepted
//   - a dispute goes to EstateCopilot, who decides the split
//   - once AGREED, ops pays out (student refund + any deduction to the host)
//     and marks it RETURNED
import { prisma } from './prisma.js';
import { notifyOps } from './notifyOps.js';

export const DEPOSIT_RESPONSE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function depositSplit(b: { depositAmount: number; depositDeduction: number | null }) {
  const deduction = Math.min(b.depositDeduction ?? 0, b.depositAmount);
  return { toGuest: b.depositAmount - deduction, toHost: deduction };
}

export function depositResponseDeadline(proposedAt: Date | null): Date | null {
  return proposedAt ? new Date(proposedAt.getTime() + DEPOSIT_RESPONSE_DAYS * DAY_MS) : null;
}

/**
 * Lazily applies the "no reply in 7 days = accepted" rule. Called wherever a
 * booking is read, so no scheduler is needed. Returns the (possibly updated)
 * booking.
 */
export async function settleDepositIfDue<T extends { id: string; depositStatus: string; depositProposedAt: Date | null; depositAmount: number; depositDeduction: number | null; guestName: string }>(b: T): Promise<T> {
  const deadline = depositResponseDeadline(b.depositProposedAt);
  if (b.depositStatus !== 'PROPOSED' || !deadline || deadline > new Date()) return b;
  const updated = await prisma.shortLetBooking.updateMany({
    where: { id: b.id, depositStatus: 'PROPOSED' },
    data: { depositStatus: 'AGREED' },
  });
  if (updated.count) {
    const { toGuest, toHost } = depositSplit(b);
    await notifyOps(
      `Caution fee ready to pay out — ${b.guestName}`,
      `No reply within ${DEPOSIT_RESPONSE_DAYS} days, so the host's proposal stands. Send ₦${toGuest.toLocaleString()} back to the guest` +
        (toHost ? ` and ₦${toHost.toLocaleString()} to the host` : '') +
        `, then mark booking ${b.id} RETURNED (POST /api/admin/stay-deposits/${b.id}/returned).`,
    );
  }
  return { ...b, depositStatus: 'AGREED' };
}
