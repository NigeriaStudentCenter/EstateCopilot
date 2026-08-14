import { env } from '../config/env.js';

export interface PaymentRequest {
  requestCode: string;
  paymentLink: string;
}

// One Paystack Payment Request per installment — the tenant gets a link they
// can pay directly, independent of the tenancy's dedicated virtual account.
// Docs: https://paystack.com/docs/payments/payment-requests
export async function createPaymentRequest(params: {
  tenantEmail: string;
  amount: number; // kobo
  dueDate: string; // ISO date
  description: string;
}): Promise<PaymentRequest> {
  if (env.mockMode || !env.paystack.secretKey) {
    const requestCode = `PRQ_mock_${Math.random().toString(36).slice(2, 10)}`;
    return {
      requestCode,
      paymentLink: `https://paystack.com/pay/mock-${requestCode}`,
    };
  }

  const response = await fetch('https://api.paystack.co/paymentrequest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.paystack.secretKey}`,
    },
    body: JSON.stringify({
      customer: params.tenantEmail,
      amount: params.amount,
      due_date: params.dueDate,
      description: params.description,
    }),
  });

  if (!response.ok) {
    throw new Error(`Paystack payment request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: { request_code: string; offline_reference: string };
  };
  return {
    requestCode: data.data.request_code,
    paymentLink: `https://paystack.com/pay/${data.data.request_code}`,
  };
}

// Splits a rent amount into N equal monthly installments starting from a
// given date. Kobo-safe rounding: any remainder goes on the final installment.
export function buildInstallmentSchedule(params: {
  totalAmount: number;
  count: number;
  startDate: Date;
}): { sequence: number; amount: number; dueDate: Date }[] {
  const { totalAmount, count, startDate } = params;
  const base = Math.floor(totalAmount / count);
  const schedule = [];
  let allocated = 0;
  for (let i = 1; i <= count; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));
    const amount = i === count ? totalAmount - allocated : base;
    allocated += amount;
    schedule.push({ sequence: i, amount, dueDate });
  }
  return schedule;
}
