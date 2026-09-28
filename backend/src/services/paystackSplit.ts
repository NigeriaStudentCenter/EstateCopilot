import { env } from '../config/env.js';

// Marketplace fees (agent fees, artisan jobs) are paid TO EstateCopilot and
// split by Paystack at the moment of payment: `transaction_charge` is the flat
// commission the platform keeps, and everything else settles to the payee's
// own bank through their subaccount. `bearer: 'account'` means the platform
// absorbs Paystack's processing fee, so the payee receives exactly their share.
// Without a subaccount (payee hasn't added a bank yet) the full amount lands
// in the platform balance and ops pays the payee out manually.
// Docs: https://paystack.com/docs/payments/split-payments

export interface SplitPayment {
  reference: string;
  paymentLink: string;
  payoutMethod: 'split' | 'manual';
}

/** Commission in whole naira, rounded down in the payee's favour. */
export function splitAmounts(total: number, platformPercent: number): { platformAmount: number; payeeAmount: number } {
  const platformAmount = Math.floor((total * platformPercent) / 100);
  return { platformAmount, payeeAmount: total - platformAmount };
}

export async function initializeSplitPayment(params: {
  email: string;
  amount: number; // naira
  platformAmount: number; // naira kept by EstateCopilot
  reference: string;
  subaccountCode?: string | null;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}): Promise<SplitPayment> {
  const payoutMethod = params.subaccountCode ? 'split' : 'manual';
  if (env.mockMode || !env.paystack.secretKey) {
    return { reference: params.reference, paymentLink: `https://paystack.com/pay/mock-${params.reference}`, payoutMethod };
  }

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.paystack.secretKey}` },
    body: JSON.stringify({
      email: params.email,
      amount: params.amount * 100,
      reference: params.reference,
      ...(params.subaccountCode
        ? { subaccount: params.subaccountCode, transaction_charge: params.platformAmount * 100, bearer: 'account' }
        : {}),
      ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
      metadata: params.metadata ?? {},
    }),
  });
  if (!response.ok) {
    throw new Error(`Paystack transaction initialize failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { data: { authorization_url: string; reference: string } };
  return { reference: data.data.reference, paymentLink: data.data.authorization_url, payoutMethod };
}
