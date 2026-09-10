import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mockMode: process.env.MOCK_MODE !== 'false',
  databaseUrl: process.env.DATABASE_URL,

  smileId: {
    partnerId: process.env.SMILE_ID_PARTNER_ID,
    apiKey: process.env.SMILE_ID_API_KEY,
    // "live" (api.smileidentity.com) or "sandbox" (testapi.…). Real checks need
    // BOTH partnerId and apiKey set; with either missing, verifyNinBvn() stays
    // on the permissive mock pass.
    environment: (process.env.SMILE_ID_ENV ?? 'live').toLowerCase(),
    // Nigeria ID types on Smile ID. NIN_V2 is the current national-ID lookup;
    // override if your partner account is provisioned for a different type
    // (NIN_SLIP, V_NIN) or BVN variant (BVN_MFA).
    ninIdType: process.env.SMILE_ID_NIN_ID_TYPE ?? 'NIN_V2',
    bvnIdType: process.env.SMILE_ID_BVN_ID_TYPE ?? 'BVN',
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
    // Meta Graph API version for outbound sends. Bump deliberately — a new
    // version can change payload/field shapes.
    graphVersion: process.env.WA_GRAPH_VERSION ?? 'v23.0',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioWhatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
    // Marketing AI agent (EstateCopilot + AI Academy). Off by default: when
    // false the inbound webhook keeps its existing tenant/guarantor-ops
    // classifier behaviour untouched. Set WA_AGENT_ENABLED=true to route
    // inbound messages through the brand-aware agent instead.
    agentEnabled: process.env.WA_AGENT_ENABLED === 'true',
    agentModel: process.env.WA_AGENT_MODEL ?? 'claude-haiku-4-5-20251001',
    // Used for not-yet-known brand, long messages, complaints and legal/
    // financial topics.
    agentModelComplex: process.env.WA_AGENT_MODEL_COMPLEX ?? 'claude-sonnet-5',
  },
  aiAcademy: {
    // Where an AI Academy enrolment enquiry is sent to start onboarding.
    onboardingUrl: process.env.AI_ACADEMY_ONBOARDING_URL ?? 'https://estatecopilot.org/ai-academy',
  },
  // AI Academy on Wheels (university / professional) enrolment provisioning.
  // The Microsoft Form's Power Automate flow POSTs to /api/ai-academy/enrol
  // with AI_ACADEMY_ENROL_SECRET; this module then does the M365 side via
  // app-only Graph. Graph auth falls back to the SharePoint app (same tenant).
  aiAcademyEnrol: {
    secret: process.env.AI_ACADEMY_ENROL_SECRET, // unset => route is 404
    accountDomain: process.env.AI_ACADEMY_ACCOUNT_DOMAIN ?? 'bsoedu.org',
    sitePath: process.env.AI_ACADEMY_SITE_PATH ?? 'bsoed.sharepoint.com:/sites/AIAcademy',
    listName: process.env.AI_ACADEMY_ENROL_LIST_NAME ?? 'AI Academy Enrolments',
    listId: process.env.AI_ACADEMY_ENROL_LIST_ID, // optional; else resolved/created by name
    teamGroupId: process.env.AI_ACADEMY_TEAM_GROUP_ID, // the "AI Academy" M365 group/team
    licenseSkuId: process.env.AI_ACADEMY_LICENSE_SKU_ID, // Microsoft 365 A1 for students skuId
    welcomeFrom: process.env.AI_ACADEMY_WELCOME_FROM ?? 'john@bsoedu.org',
    tenantId: process.env.AI_ACADEMY_GRAPH_TENANT_ID ?? process.env.SHAREPOINT_TENANT_ID,
    clientId: process.env.AI_ACADEMY_GRAPH_CLIENT_ID ?? process.env.SHAREPOINT_CLIENT_ID,
    clientSecret: process.env.AI_ACADEMY_GRAPH_CLIENT_SECRET ?? process.env.SHAREPOINT_CLIENT_SECRET,
  },
  tenantAuth: {
    jwtSecret: process.env.TENANT_JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  },
  landlordAuth: {
    jwtSecret: process.env.LANDLORD_JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
  },
  artisanAuth: {
    jwtSecret: process.env.ARTISAN_JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
    // No SMS provider wired yet — when OTP_PROVIDER is unset the code is a fixed
    // 000000 and returned in the request so the flow is usable end-to-end.
    otpProvider: process.env.OTP_PROVIDER,
  },
  subscription: {
    monthlyAmountKobo: Number(process.env.LANDLORD_SUBSCRIPTION_AMOUNT_KOBO ?? 1_000_000), // ₦10,000
    // A pre-created Paystack Plan code (required to go live — Paystack has no
    // "create plan inline with a transaction" shortcut). Without it we stay
    // in mock mode for this specific flow even if PAYSTACK_SECRET_KEY is set.
    paystackPlanCode: process.env.PAYSTACK_LANDLORD_PLAN_CODE,
    signupCallbackUrl: process.env.MARKETING_SIGNUP_CALLBACK_URL ?? 'http://localhost:5175/signup/callback',
    // Pilot billing: landlords pay on this Paystack-hosted page, then an
    // operator activates the account with the admin endpoint below. No
    // secret key or Paystack Plan needed for this path.
    hostedPageUrl: process.env.PAYSTACK_HOSTED_PAGE_URL ?? 'https://paystack.shop/pay/estatecopilot',
  },
  admin: {
    // Guards POST /api/landlord-auth/admin/* (manual subscription activation).
    // Unset => the admin endpoints are disabled entirely.
    apiKey: process.env.ADMIN_API_KEY,
  },
  kolo: {
    // Kolo affiliate platform. When a landlord who arrived via an affiliate
    // link (?ref=CODE) goes ACTIVE, we report that conversion to Kolo so the
    // referrer earns their commission. Both unset => no-op, exactly like the
    // SharePoint mirror: never a hard dependency of the signup flow.
    baseUrl: process.env.KOLO_BASE_URL, // e.g. https://api.kolo.ng
    apiKey: process.env.KOLO_API_KEY, // the X-Kolo-Key issued to EstateCopilot's tenant
    programId: process.env.KOLO_PROGRAM_ID ?? 'program_ec_landlord',
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    landlordDisplayName: process.env.LANDLORD_DISPLAY_NAME ?? 'Aliko Hassan',
  },
  email: {
    provider: process.env.EMAIL_PROVIDER, // "resend" — unset means mock/log-only
    apiKey: process.env.EMAIL_API_KEY,
    from: process.env.EMAIL_FROM ?? 'EstateCopilot <ops@estatecopilot.org>',
  },
  ops: {
    // Where "someone booked a viewing / a handyman wants to visit" alerts go.
    whatsappNumber: process.env.OPS_WHATSAPP_NUMBER ?? '2348000000000',
    email: process.env.OPS_EMAIL ?? 'ops@estatecopilot.example',
  },
  tenantPortal: {
    baseUrl: process.env.TENANT_PORTAL_URL ?? 'http://localhost:5174',
  },
  storage: {
    // Property photos. With a connection string set, uploads go to Azure Blob
    // Storage; without one (local dev / mock) they're written under backend/uploads
    // and served by express.static. `publicApiUrl` is how a browser reaches this
    // API, used to build the URL for locally-stored images.
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    container: process.env.AZURE_STORAGE_CONTAINER ?? 'property-images',
    publicApiUrl: (process.env.PUBLIC_API_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}`).replace(/\/$/, ''),
    // Per-image cap on the *raw* upload (a phone photo is ~2-6 MB); the server
    // re-encodes each one down to ~200-400 KB before storing.
    maxImageBytes: Number(process.env.MAX_PROPERTY_IMAGE_BYTES ?? 8 * 1024 * 1024),
    maxImagesPerProperty: Number(process.env.MAX_IMAGES_PER_PROPERTY ?? 10),
  },
  sharepoint: {
    // Mirrors bookings/quotes/subscriptions into dedicated SharePoint lists
    // via Microsoft Graph (app-only, client credentials). Each list ID is
    // independently optional — an unset one just skips that particular
    // mirror. Always best-effort, never a hard dependency.
    tenantId: process.env.SHAREPOINT_TENANT_ID,
    clientId: process.env.SHAREPOINT_CLIENT_ID,
    clientSecret: process.env.SHAREPOINT_CLIENT_SECRET,
    siteId: process.env.SHAREPOINT_SITE_ID,
    listIdArtisanRequests: process.env.SHAREPOINT_LIST_ID,
    listIdQuotations: process.env.SHAREPOINT_LIST_ID_QUOTATIONS,
    listIdHandymanVisits: process.env.SHAREPOINT_LIST_ID_HANDYMAN_VISITS,
    listIdPropertyViewings: process.env.SHAREPOINT_LIST_ID_PROPERTY_VIEWINGS,
    listIdSubscribedLandlords: process.env.SHAREPOINT_LIST_ID_SUBSCRIBED_LANDLORDS,
  },
};
