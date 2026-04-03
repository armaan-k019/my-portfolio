import { Competitor } from '../types/index';

export const COMPETITORS: Competitor[] = [
  {
    name: 'Brex',
    region: 'Global',
    scrapeUrls: [
      'https://www.brex.com/pricing',
      'https://www.brex.com/product/corporate-cards',
      'https://www.brex.com/product/expense-management',
    ],
    notes: 'US-focused corporate card and spend management. Raised $300M Series D. Strong on integrations.',
    linkedinUrl: 'https://www.linkedin.com/company/brex-hq/',
    customerUrl: 'https://www.brex.com/customers',
  },
  {
    name: 'Ramp',
    region: 'Global',
    scrapeUrls: [
      'https://ramp.com/pricing',
      'https://ramp.com/corporate-cards',
      'https://ramp.com/expense-management',
    ],
    notes: 'US corporate card focused on cost savings and automation. Strong on analytics.',
    linkedinUrl: 'https://www.linkedin.com/company/ramp-finance/',
    customerUrl: 'https://ramp.com/customers',
  },
  {
    name: 'Clara',
    region: 'LatAm',
    scrapeUrls: [
      'https://www.clara.com/mx/precios',
      'https://www.clara.com/mx/tarjeta-empresarial',
      'https://www.clara.com/mx',
    ],
    notes: 'LatAm corporate card - operates in Mexico, Brazil, Colombia. Main competitor in region.',
    linkedinUrl: 'https://www.linkedin.com/company/claracard/',
    customerUrl: 'https://www.clara.com/mx/casos-de-exito',
  },
  {
    name: 'Higo',
    region: 'LatAm',
    scrapeUrls: [
      'https://www.higo.io/precios',
      'https://www.higo.io',
      'https://www.higo.io/producto',
    ],
    notes: 'Mexico-focused B2B payments and corporate card. Focuses on AP automation.',
    linkedinUrl: 'https://www.linkedin.com/company/higoapp/',
  },
  {
    name: 'Tribal Credit',
    region: 'Both',
    scrapeUrls: [
      'https://www.tribal.credit/pricing',
      'https://www.tribal.credit',
      'https://www.tribal.credit/features',
    ],
    notes: 'Emerging market corporate card. Operates in Mexico, UAE, Brazil.',
    linkedinUrl: 'https://www.linkedin.com/company/tribal-credit/',
  },
  {
    name: 'Konfío',
    region: 'LatAm',
    scrapeUrls: [
      'https://konfio.mx/tarjeta-de-credito-empresarial/',
      'https://konfio.mx/precios/',
      'https://konfio.mx',
    ],
    notes: 'Mexico-focused SME lender and corporate card issuer.',
    linkedinUrl: 'https://www.linkedin.com/company/konfio/',
  },
  {
    name: 'Belvo',
    region: 'LatAm',
    scrapeUrls: [
      'https://belvo.com/pricing/',
      'https://belvo.com',
      'https://belvo.com/products/',
    ],
    notes: 'Open banking API platform for LatAm. Not a direct card competitor but in same ecosystem.',
    linkedinUrl: 'https://www.linkedin.com/company/belvo/',
  },
  {
    name: 'Mendel',
    region: 'LatAm',
    scrapeUrls: [
      'https://www.mendel.ai',
      'https://www.mendel.ai/precios',
    ],
    notes: 'Mexico corporate card and expense management for mid-market.',
    linkedinUrl: 'https://www.linkedin.com/company/mendel-ai/',
  },
  {
    name: 'Rho',
    region: 'Global',
    scrapeUrls: [
      'https://www.rho.co/pricing',
      'https://www.rho.co/corporate-cards',
      'https://www.rho.co/business-banking',
      'https://www.rho.co/accounts-payable',
    ],
    notes: 'US business banking + corporate cards + AP in one platform. Targets mid-market. Strong on unified data across banking, cards, and AP.',
    linkedinUrl: 'https://www.linkedin.com/company/rho-business-banking/',
    customerUrl: 'https://www.rho.co/customers',
  },
  {
    name: 'Howden',
    region: 'Global',
    scrapeUrls: [
      'https://howden.com',
      'https://howden.com/en-gb/products-and-services',
    ],
    notes: 'Global insurance broker and risk management firm. Relevant where Jeeves competes for international treasury and risk management mandates.',
    linkedinUrl: 'https://www.linkedin.com/company/howden-group-holdings/',
  },
  {
    name: 'Mercury',
    region: 'Global',
    scrapeUrls: [
      'https://mercury.com/pricing',
      'https://mercury.com/corporate-card',
      'https://mercury.com/features',
    ],
    notes: 'US-focused startup bank targeting tech companies and startups. Debit-based, no credit float. Known for fast onboarding.',
    linkedinUrl: 'https://www.linkedin.com/company/mercury-technologies/',
    customerUrl: 'https://mercury.com/customers',
  },
  {
    name: 'Airwallex',
    region: 'Global',
    scrapeUrls: [
      'https://www.airwallex.com/us/pricing',
      'https://www.airwallex.com/us/corporate-card',
      'https://www.airwallex.com/us',
    ],
    notes: 'Global business account and corporate card with strong multi-currency and FX capabilities. Competes with Jeeves on international expansion use cases.',
    linkedinUrl: 'https://www.linkedin.com/company/airwallex/',
    customerUrl: 'https://www.airwallex.com/us/case-studies',
  },
  {
    name: 'Nium',
    region: 'Global',
    scrapeUrls: [
      'https://www.nium.com',
      'https://www.nium.com/solutions',
      'https://www.nium.com/pricing',
    ],
    notes: 'Global payments infrastructure and embedded finance. Issues cards and enables cross-border payouts in 190+ countries. Often a behind-the-scenes rails provider.',
    linkedinUrl: 'https://www.linkedin.com/company/nium/',
  },
  {
    name: 'Melio',
    region: 'Global',
    scrapeUrls: [
      'https://meliopayments.com/pricing',
      'https://meliopayments.com',
      'https://meliopayments.com/features',
    ],
    notes: 'US SMB-focused AP automation and bill pay. Allows paying vendors by card even when they only accept ACH. Competes on AP workflow.',
    linkedinUrl: 'https://www.linkedin.com/company/melio-payments/',
  },
  {
    name: 'Payhawk',
    region: 'Global',
    scrapeUrls: [
      'https://payhawk.com/en/pricing',
      'https://payhawk.com/en/corporate-cards',
      'https://payhawk.com',
    ],
    notes: 'European spend management and corporate cards. Strong in UK and EU. ERP integrations with NetSuite, SAP, Xero.',
    linkedinUrl: 'https://www.linkedin.com/company/payhawk/',
    customerUrl: 'https://payhawk.com/en/customers',
  },
];

export function findCompetitor(name: string): Competitor | undefined {
  const normalized = name.toLowerCase().trim();
  return COMPETITORS.find(
    (c) =>
      c.name.toLowerCase() === normalized ||
      c.name.toLowerCase().includes(normalized) ||
      normalized.includes(c.name.toLowerCase()),
  );
}

export function getCompetitorNames(): string[] {
  return COMPETITORS.map((c) => c.name);
}
