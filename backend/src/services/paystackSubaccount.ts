import { env } from '../config/env.js';

export interface ResolvedAccount {
  accountName: string;
}

// Confirms a bank account number actually belongs to the name on file —
// the same check Paystack (and every Nigerian fintech) runs before letting
// anyone attach a bank account for payouts.
export async function resolveBankAccount(accountNumber: string, bankCode: string): Promise<ResolvedAccount> {
  if (env.mockMode || !env.paystack.secretKey) {
    return { accountName: 'MOCK ACCOUNT HOLDER' };
  }

  const response = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: { Authorization: `Bearer ${env.paystack.secretKey}` } },
  );
  if (!response.ok) {
    throw new Error(`Could not verify that bank account (${response.status})`);
  }
  const data = (await response.json()) as { data: { account_name: string } };
  return { accountName: data.data.account_name };
}

export interface Subaccount {
  subaccountCode: string;
}

// A Paystack Subaccount is the landlord's own settlement destination. Once a
// tenancy's dedicated virtual account (or payment request) is linked to it,
// Paystack pays the landlord directly — the platform's own Paystack balance
// is never credited with a kobo of rent.
export async function createLandlordSubaccount(params: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
}): Promise<Subaccount> {
  if (env.mockMode || !env.paystack.secretKey) {
    return { subaccountCode: `mock_ACCT_${Date.now().toString(36)}` };
  }

  const response = await fetch('https://api.paystack.co/subaccount', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.paystack.secretKey}`,
    },
    body: JSON.stringify({
      business_name: params.businessName,
      settlement_bank: params.bankCode,
      account_number: params.accountNumber,
      percentage_charge: 0, // the landlord keeps 100% of rent; the platform is paid via the flat subscription, not a rent cut
    }),
  });
  if (!response.ok) {
    throw new Error(`Paystack subaccount creation failed: ${response.status}`);
  }
  const data = (await response.json()) as { data: { subaccount_code: string } };
  return { subaccountCode: data.data.subaccount_code };
}
