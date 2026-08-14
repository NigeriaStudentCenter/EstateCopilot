import { env } from '../config/env.js';

// Whether we can actually talk to Paystack for the landlord subscription
// flow — needs both a secret key AND a pre-created Plan code (Paystack has
// no endpoint to attach a plan to a transaction without one existing first).
export function subscriptionsAreLive(): boolean {
  return !env.mockMode && !!env.paystack.secretKey && !!env.subscription.paystackPlanCode;
}

export interface InitializedSubscription {
  reference: string;
  authorizationUrl: string | null; // null in mock mode — the signup page shows an inline mock-pay step instead
}

// Kicks off the ₦10,000/month subscription: creates/attaches a Paystack
// customer and starts a transaction against the landlord plan. Paystack
// handles the recurring charge automatically after the first successful one.
export async function initializeSubscription(params: {
  email: string;
  name: string;
  callbackUrl?: string;
}): Promise<InitializedSubscription> {
  if (!subscriptionsAreLive()) {
    return { reference: `mock_sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, authorizationUrl: null };
  }

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.paystack.secretKey}`,
    },
    body: JSON.stringify({
      email: params.email,
      amount: env.subscription.monthlyAmountKobo,
      plan: env.subscription.paystackPlanCode,
      callback_url: params.callbackUrl ?? env.subscription.signupCallbackUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Paystack transaction initialize failed: ${response.status}`);
  }

  const data = (await response.json()) as { data: { authorization_url: string; reference: string } };
  return { reference: data.data.reference, authorizationUrl: data.data.authorization_url };
}

export interface VerifiedSubscription {
  success: boolean;
  customerCode?: string;
  subscriptionCode?: string;
  currentPeriodEnd?: Date;
}

export async function verifySubscriptionTransaction(reference: string): Promise<VerifiedSubscription> {
  if (!subscriptionsAreLive()) {
    // Mock mode: any reference we generated ourselves "succeeds" — this is
    // what lets the whole signup flow be demoed without a Paystack account.
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    return {
      success: true,
      customerCode: `mock_cus_${reference.slice(-8)}`,
      subscriptionCode: `mock_subcode_${reference.slice(-8)}`,
      currentPeriodEnd: periodEnd,
    };
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
  });
  if (!response.ok) return { success: false };

  const data = (await response.json()) as {
    data: {
      status: string;
      customer: { customer_code: string };
      plan_object?: { plan_code: string };
      subscription_code?: string;
    };
  };
  if (data.data.status !== 'success') return { success: false };

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return {
    success: true,
    customerCode: data.data.customer.customer_code,
    subscriptionCode: data.data.subscription_code,
    currentPeriodEnd: periodEnd,
  };
}
