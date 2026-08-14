import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mockMode: process.env.MOCK_MODE !== 'false',
  databaseUrl: process.env.DATABASE_URL,

  smileId: {
    partnerId: process.env.SMILE_ID_PARTNER_ID,
    apiKey: process.env.SMILE_ID_API_KEY,
  },
  mono: {
    secretKey: process.env.MONO_SECRET_KEY,
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
  },
  flutterwave: {
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
  },
  whatsapp: {
    metaToken: process.env.META_WHATSAPP_TOKEN,
    metaPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
    metaVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? 'change-me-verify-token',
    metaAppSecret: process.env.META_APP_SECRET,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioWhatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  tenantAuth: {
    jwtSecret: process.env.TENANT_JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  },
  landlordAuth: {
    jwtSecret: process.env.LANDLORD_JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  },
  subscription: {
    monthlyAmountKobo: Number(process.env.LANDLORD_SUBSCRIPTION_AMOUNT_KOBO ?? 1_000_000), // ₦10,000
    // A pre-created Paystack Plan code (required to go live — Paystack has no
    // "create plan inline with a transaction" shortcut). Without it we stay
    // in mock mode for this specific flow even if PAYSTACK_SECRET_KEY is set.
    paystackPlanCode: process.env.PAYSTACK_LANDLORD_PLAN_CODE,
    signupCallbackUrl: process.env.MARKETING_SIGNUP_CALLBACK_URL ?? 'http://localhost:5175/signup/callback',
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    landlordDisplayName: process.env.LANDLORD_DISPLAY_NAME ?? 'Aliko Hassan',
  },
  email: {
    provider: process.env.EMAIL_PROVIDER, // e.g. "resend" — unset means mock/log-only
    apiKey: process.env.EMAIL_API_KEY,
  },
  ops: {
    // Where "someone booked a viewing / a handyman wants to visit" alerts go.
    whatsappNumber: process.env.OPS_WHATSAPP_NUMBER ?? '2348000000000',
    email: process.env.OPS_EMAIL ?? 'ops@estatecopilot.example',
  },
};
