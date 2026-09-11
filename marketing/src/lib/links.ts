export const LANDLORD_PORTAL_URL = import.meta.env.VITE_LANDLORD_PORTAL_URL ?? 'http://localhost:5173';
export const TENANT_PORTAL_URL = import.meta.env.VITE_TENANT_PORTAL_URL ?? 'http://localhost:5174';
// Where artisans sign up / manage their profile (the artisan portal).
export const ARTISAN_PORTAL_URL = import.meta.env.VITE_ARTISAN_PORTAL_URL ?? 'https://artisans.estatecopilot.org';
// The referral / partner programme (Kolo partner app).
export const PARTNER_PORTAL_URL =
  import.meta.env.VITE_PARTNER_PORTAL_URL ?? 'https://red-ocean-01cfc2f03.3.azurestaticapps.net';
// The property marketplace's own subdomain — same app/build as the main
// marketing site (deployed a second time to a separate Static Web App,
// since the marketing site's Free-tier SWA is already at its custom-domain
// limit), but it opens straight into /properties. See isPropertiesHost().
export const PROPERTIES_MARKETPLACE_URL =
  import.meta.env.VITE_PROPERTIES_MARKETPLACE_URL ?? 'https://properties.estatecopilot.org';

export function isPropertiesHost(hostname: string): boolean {
  try {
    return hostname === new URL(PROPERTIES_MARKETPLACE_URL).hostname;
  } catch {
    return false;
  }
}

// The main marketing site — where the "Home"/logo link on the properties
// subdomain should actually go (internal "/" there is the marketplace, not
// the homepage).
export const MAIN_SITE_URL = import.meta.env.VITE_MAIN_SITE_URL ?? 'https://estatecopilot.org';
