// The outlet roster and desk rules for Naija Digest. Every feed URL here was
// hand-verified with a direct curl before being added — outlets that block
// automated requests (TheCable, Guardian Nigeria, The Nation, Sahara
// Reporters, Pulse Nigeria as of Aug 2026) are deliberately left out rather
// than scraped around.

export interface Source {
  name: string;
  feedUrl: string;
  desk: string; // this outlet's home desk
  // Listing/classified boards (jobs, later maybe properties) are a
  // different content type from news — a job's "About the company"
  // boilerplate can mention "real estate" for a totally unrelated role
  // (a gardener at a property-management firm), so cross-tagging by
  // keyword only makes sense for actual news sources. Defaults to true.
  crossTag?: boolean;
}

export const DESKS = [
  { id: 'top-stories', label: 'Top Stories' },
  { id: 'politics', label: 'Politics' },
  { id: 'business', label: 'Business' },
  { id: 'sports', label: 'Sports' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'metro', label: 'Metro' },
  { id: 'diaspora', label: 'Diaspora & Return' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'properties', label: 'Properties' },
] as const;

export const SOURCES: Source[] = [
  { name: 'The Punch', feedUrl: 'https://punchng.com/feed/', desk: 'top-stories' },
  { name: 'Vanguard', feedUrl: 'https://www.vanguardngr.com/feed/', desk: 'top-stories' },
  { name: 'ThisDay', feedUrl: 'https://www.thisdaylive.com/index.php/feed/', desk: 'top-stories' },
  { name: 'Daily Trust', feedUrl: 'https://dailytrust.com/feed/', desk: 'top-stories' },
  { name: 'Leadership', feedUrl: 'https://leadership.ng/feed/', desk: 'top-stories' },
  { name: 'Premium Times', feedUrl: 'https://www.premiumtimesng.com/feed', desk: 'top-stories' },
  { name: 'Daily Post', feedUrl: 'https://dailypost.ng/feed', desk: 'top-stories' },
  { name: 'Tribune Online', feedUrl: 'https://tribuneonlineng.com/feed/', desk: 'top-stories' },
  { name: 'Legit.ng', feedUrl: 'https://www.legit.ng/rss/all.rss', desk: 'top-stories' },
  { name: 'Channels TV', feedUrl: 'https://www.channelstv.com/feed/', desk: 'top-stories' },
  { name: 'BusinessDay', feedUrl: 'https://businessday.ng/feed/', desk: 'business' },
  { name: 'Complete Sports', feedUrl: 'https://www.completesports.com/feed/', desk: 'sports' },
  { name: 'BellaNaija', feedUrl: 'https://www.bellanaija.com/feed/', desk: 'entertainment' },
  { name: 'Legit.ng Entertainment', feedUrl: 'https://www.legit.ng/rss/entertainment.rss', desk: 'entertainment' },
  { name: 'The Net (Nigerian Entertainment Today)', feedUrl: 'https://thenet.ng/feed/', desk: 'entertainment' },
  { name: 'Jobzilla Nigeria', feedUrl: 'https://www.jobzilla.ng/feed', desk: 'jobs', crossTag: false },
  { name: 'Nigeria Real Estate Blog', feedUrl: 'https://nigeriarealestateblog.com/feed/', desk: 'properties' },
  { name: 'Octo5', feedUrl: 'https://octo5.co/feed/', desk: 'properties' },
  { name: 'Vanguard Homes & Property', feedUrl: 'https://www.vanguardngr.com/category/homes-property/feed/', desk: 'properties' },
];

// A story can land in more than one desk — its home desk, plus any keyword
// desk whose terms show up in the title/snippet. Plain arrays on purpose:
// easy to read, easy to tune, no hidden model behind the categorization.
export const KEYWORD_DESKS: { desk: string; keywords: string[] }[] = [
  {
    desk: 'politics',
    keywords: [
      'president', 'senate', 'national assembly', 'election', 'governor',
      'apc', 'pdp', 'labour party', 'inec', 'minister', 'presidency',
      'house of reps', 'lawmaker', 'lawmakers', 'senator',
    ],
  },
  {
    desk: 'metro',
    keywords: [
      'police', 'arrest', 'fire outbreak', 'accident', 'court', 'kidnap',
      'robbery', 'clash', 'flood', 'explosion', 'gunmen',
    ],
  },
  {
    desk: 'diaspora',
    keywords: [
      'diaspora', 'remittance', 'returnee', 'immigra', 'visa', 'abroad',
      'japa', 'repatriat', 'deported', 'deportation',
    ],
  },
  {
    desk: 'sports',
    keywords: [
      'super eagles', 'premier league', 'nff', 'uefa', 'fifa', 'afcon',
      'transfer window', 'nba', 'champions league', 'world cup qualifier',
    ],
  },
  {
    desk: 'business',
    keywords: [
      'naira', 'cbn', 'inflation', 'stock exchange', 'forex', 'interest rate',
      'gdp', 'nnpc', 'fuel price', 'subsidy',
    ],
  },
  {
    desk: 'jobs',
    keywords: [
      'recruitment', 'job vacancy', 'vacancies', 'hiring', 'job openings',
      'job opening', 'apply now', 'internship', 'nysc', 'npower',
      'job alert', 'employment scheme', 'graduate trainee', 'job opportunity',
      'urgently needed', 'career opportunity', 'is recruiting',
    ],
  },
  {
    desk: 'properties',
    keywords: [
      'real estate', 'house for sale', 'land for sale', 'property for sale',
      'apartment for sale', 'apartment for rent', 'flat for rent',
      'house for rent', 'to let', 'duplex', 'shortlet', 'plot of land',
      'housing estate', 'mortgage', 'estate agent', 'property market',
      'housing deficit',
    ],
  },
];
