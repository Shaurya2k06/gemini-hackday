const SECTORS = [
  'B2B software',
  'Fintech',
  'Healthcare SaaS',
  'Industrial tech',
  'Logistics software',
  'PropTech',
  'EdTech',
  'Cybersecurity',
  'DevTools',
  'AI infrastructure',
  'Manufacturing software',
  'Legal tech',
  'HR tech',
  'Insurtech',
  'AgriTech',
  'Climate tech',
  'Retail tech',
  'Construction tech',
  'Media tech',
  'Payments infrastructure',
];

const GEOGRAPHIES = [
  'Germany',
  'France',
  'the UK',
  'the US',
  'Singapore',
  'Brazil',
  'India',
  'Canada',
  'Australia',
  'the Netherlands',
  'Spain',
  'Italy',
  'the Nordics',
  'DACH',
  'Southeast Asia',
  'Mexico',
  'Japan',
  'South Korea',
  'the UAE',
  'Poland',
];

const MANDATE_TEMPLATES = [
  (sector, geo) => `${sector} in ${geo}, $15M–$40M revenue`,
  (sector, geo) => `${sector} companies in ${geo}, 50–200 employees`,
  (sector, geo) => `${sector} in ${geo} with $5M+ EBITDA`,
  (sector, geo) => `${sector} in ${geo}, Series B+`,
  (sector, geo) => `${sector} in ${geo}, $10M–$30M revenue and 100+ employees`,
];

function buildMandatePool() {
  const pool = [];
  const seen = new Set();
  for (const sector of SECTORS) {
    for (const geo of GEOGRAPHIES) {
      for (const template of MANDATE_TEMPLATES) {
        const mandate = template(sector, geo);
        if (!seen.has(mandate)) {
          seen.add(mandate);
          pool.push(mandate);
        }
      }
    }
  }
  return pool;
}

export const SAMPLE_MANDATES_POOL = buildMandatePool();

export function pickRandomMandates(count = 4) {
  const pool = [...SAMPLE_MANDATES_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
