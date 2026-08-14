import { env } from '../config/env.js';

export interface VirtualAccount {
  accountNumber: string;
  bankName: string;
  accountReference: string;
}

// Dedicated Virtual Account per tenancy. When the landlord has a Paystack
// subaccount on file, it's attached here so every rent payment settles
// straight into the landlord's own bank account — the platform's Paystack
// balance is never credited with it, split or otherwise.
// Docs: https://paystack.com/docs/payments/dedicated-virtual-accounts
export async function createDedicatedVirtualAccount(params: {
  tenancyId: string;
  tenantEmail: string;
  tenantPhone: string;
  landlordSubaccountCode?: string;
}): Promise<VirtualAccount> {
  if (env.mockMode || !env.paystack.secretKey) {
    return {
      accountNumber: `90${Math.floor(10000000 + Math.random() * 89999999)}`,
      bankName: 'Wema Bank (Paystack-Titan)',
      accountReference: `mock_${params.tenancyId}`,
    };
  }

  const response = await fetch('https://api.paystack.co/dedicated_account', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.paystack.secretKey}`,
    },
    body: JSON.stringify({
      email: params.tenantEmail,
      phone: params.tenantPhone,
      preferred_bank: 'wema-bank',
      ...(params.landlordSubaccountCode ? { subaccount: params.landlordSubaccountCode } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Paystack DVA creation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: { account_number: string; bank: { name: string } };
  };
  return {
    accountNumber: data.data.account_number,
    bankName: data.data.bank.name,
    accountReference: params.tenancyId,
  };
}
