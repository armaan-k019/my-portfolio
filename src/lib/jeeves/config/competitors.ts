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
