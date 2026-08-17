// Canonical Nigeria geography reference — Nigeria's 36 states plus the FCT
// (Abuja, technically not a state but treated as one everywhere else in this
// codebase's data, matching the existing seed properties). Drives per-state
// property/artisan pages, the landlord signup state picker, and the public
// state filter. `tier` scales generated rent so Lagos/Abuja don't look the
// same price as everywhere else.

export type StateTier = 'premium' | 'upper' | 'standard';

export interface NigeriaState {
  name: string;
  slug: string;
  lgas: [string, string, string];
  tier: StateTier;
}

export const NIGERIA_STATES: NigeriaState[] = [
  { name: 'Abia', slug: 'abia', lgas: ['Umuahia North', 'Aba North', 'Aba South'], tier: 'standard' },
  { name: 'Adamawa', slug: 'adamawa', lgas: ['Yola North', 'Yola South', 'Girei'], tier: 'standard' },
  { name: 'Akwa Ibom', slug: 'akwa-ibom', lgas: ['Uyo', 'Eket', 'Ikot Ekpene'], tier: 'upper' },
  { name: 'Anambra', slug: 'anambra', lgas: ['Awka South', 'Onitsha North', 'Nnewi North'], tier: 'upper' },
  { name: 'Bauchi', slug: 'bauchi', lgas: ['Bauchi', 'Ningi', 'Azare'], tier: 'standard' },
  { name: 'Bayelsa', slug: 'bayelsa', lgas: ['Yenagoa', 'Sagbama', 'Ogbia'], tier: 'standard' },
  { name: 'Benue', slug: 'benue', lgas: ['Makurdi', 'Gboko', 'Otukpo'], tier: 'standard' },
  { name: 'Borno', slug: 'borno', lgas: ['Maiduguri', 'Jere', 'Konduga'], tier: 'standard' },
  { name: 'Cross River', slug: 'cross-river', lgas: ['Calabar Municipal', 'Calabar South', 'Ogoja'], tier: 'upper' },
  { name: 'Delta', slug: 'delta', lgas: ['Oshimili South', 'Warri South', 'Sapele'], tier: 'upper' },
  { name: 'Ebonyi', slug: 'ebonyi', lgas: ['Abakaliki', 'Afikpo North', 'Ohaozara'], tier: 'standard' },
  { name: 'Edo', slug: 'edo', lgas: ['Oredo', 'Egor', 'Ikpoba-Okha'], tier: 'upper' },
  { name: 'Ekiti', slug: 'ekiti', lgas: ['Ado-Ekiti', 'Ikere', 'Ikole'], tier: 'standard' },
  { name: 'Enugu', slug: 'enugu', lgas: ['Enugu East', 'Enugu North', 'Nsukka'], tier: 'upper' },
  { name: 'FCT Abuja', slug: 'fct-abuja', lgas: ['AMAC', 'Bwari', 'Gwagwalada'], tier: 'premium' },
  { name: 'Gombe', slug: 'gombe', lgas: ['Gombe', 'Kaltungo', 'Billiri'], tier: 'standard' },
  { name: 'Imo', slug: 'imo', lgas: ['Owerri Municipal', 'Owerri North', 'Orlu'], tier: 'standard' },
  { name: 'Jigawa', slug: 'jigawa', lgas: ['Dutse', 'Hadejia', 'Gumel'], tier: 'standard' },
  { name: 'Kaduna', slug: 'kaduna', lgas: ['Kaduna North', 'Kaduna South', 'Zaria'], tier: 'upper' },
  { name: 'Kano', slug: 'kano', lgas: ['Kano Municipal', 'Nassarawa', 'Fagge'], tier: 'upper' },
  { name: 'Katsina', slug: 'katsina', lgas: ['Katsina', 'Daura', 'Funtua'], tier: 'standard' },
  { name: 'Kebbi', slug: 'kebbi', lgas: ['Birnin Kebbi', 'Argungu', 'Yauri'], tier: 'standard' },
  { name: 'Kogi', slug: 'kogi', lgas: ['Lokoja', 'Okene', 'Idah'], tier: 'standard' },
  { name: 'Kwara', slug: 'kwara', lgas: ['Ilorin West', 'Ilorin East', 'Ilorin South'], tier: 'upper' },
  { name: 'Lagos', slug: 'lagos', lgas: ['Eti-Osa', 'Ikeja', 'Surulere'], tier: 'premium' },
  { name: 'Nasarawa', slug: 'nasarawa', lgas: ['Lafia', 'Keffi', 'Akwanga'], tier: 'standard' },
  { name: 'Niger', slug: 'niger', lgas: ['Chanchaga', 'Bosso', 'Suleja'], tier: 'standard' },
  { name: 'Ogun', slug: 'ogun', lgas: ['Abeokuta South', 'Abeokuta North', 'Ijebu Ode'], tier: 'upper' },
  { name: 'Ondo', slug: 'ondo', lgas: ['Akure South', 'Akure North', 'Owo'], tier: 'standard' },
  { name: 'Osun', slug: 'osun', lgas: ['Osogbo', 'Ile-Ife', 'Ilesa West'], tier: 'standard' },
  { name: 'Oyo', slug: 'oyo', lgas: ['Ibadan North', 'Ibadan South-West', 'Ogbomosho North'], tier: 'upper' },
  { name: 'Plateau', slug: 'plateau', lgas: ['Jos North', 'Jos South', 'Jos East'], tier: 'upper' },
  { name: 'Rivers', slug: 'rivers', lgas: ['Port Harcourt', 'Obio-Akpor', 'Eleme'], tier: 'upper' },
  { name: 'Sokoto', slug: 'sokoto', lgas: ['Sokoto North', 'Sokoto South', 'Wamakko'], tier: 'standard' },
  { name: 'Taraba', slug: 'taraba', lgas: ['Jalingo', 'Wukari', 'Bali'], tier: 'standard' },
  { name: 'Yobe', slug: 'yobe', lgas: ['Damaturu', 'Potiskum', 'Nguru'], tier: 'standard' },
  { name: 'Zamfara', slug: 'zamfara', lgas: ['Gusau', 'Kaura Namoda', 'Talata Mafara'], tier: 'standard' },
];

const BY_SLUG = new Map(NIGERIA_STATES.map((s) => [s.slug, s]));
const BY_NAME = new Map(NIGERIA_STATES.map((s) => [s.name, s]));

export function stateBySlug(slug: string | undefined): NigeriaState | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

export function stateByName(name: string | undefined): NigeriaState | undefined {
  return name ? BY_NAME.get(name) : undefined;
}
