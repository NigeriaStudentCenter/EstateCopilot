// Guest identity for stays: every booking is checked against the BVN or NIN
// registry before a payment link exists. We keep only what a host needs to
// trust the booking — the ID type, last 4 digits and the registry's name —
// never the full number.
import { idVerificationLive, verifyNinBvn } from './smileId.js';

export type GuestIdResult =
  | { ok: true; idCheck: 'VERIFIED' | 'NOT_CHECKED'; idType: 'BVN' | 'NIN'; idLast4: string; idVerifiedName?: string }
  | { ok: false; httpStatus: 422 | 503; error: string };

export async function checkGuestId(params: { idType: 'BVN' | 'NIN'; idNumber: string; fullName: string }): Promise<GuestIdResult> {
  const idLast4 = params.idNumber.slice(-4);

  // No provider connected yet: take the booking but flag it plainly to the
  // host ("ID not checked") rather than pretending it passed.
  if (!idVerificationLive()) {
    return { ok: true, idCheck: 'NOT_CHECKED', idType: params.idType, idLast4 };
  }

  const result = await verifyNinBvn({
    fullName: params.fullName,
    ...(params.idType === 'NIN' ? { nin: params.idNumber } : { bvn: params.idNumber }),
  });

  if (result.status === 'VERIFIED') {
    return { ok: true, idCheck: 'VERIFIED', idType: params.idType, idLast4, idVerifiedName: result.matchedName ?? params.fullName };
  }
  if (result.errored) {
    return { ok: false, httpStatus: 503, error: 'ID verification is not available right now — please try again in a few minutes.' };
  }
  return {
    ok: false,
    httpStatus: 422,
    error: `We couldn't match that ${params.idType} to the name "${params.fullName}". Use your name exactly as it appears on your ${params.idType === 'BVN' ? 'bank records' : 'NIN slip'}.`,
  };
}
