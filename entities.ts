const COUNTRIES = new Set(
  (
    'afghanistan albania algeria argentina australia austria bangladesh belarus belgium bolivia brazil bulgaria ' +
    'canada chile china colombia croatia cuba cyprus czech denmark ecuador egypt estonia ethiopia finland france ' +
    'georgia germany ghana greece haiti honduras hungary iceland india indonesia iran iraq ireland israel italy ' +
    'japan jordan kazakhstan kenya kuwait lebanon libya lithuania luxembourg malaysia mexico moldova morocco ' +
    'myanmar nepal netherlands new zealand nicaragua nigeria north korea norway pakistan palestine panama peru ' +
    'philippines poland portugal qatar romania russia saudi arabia serbia singapore slovakia slovenia somalia ' +
    'south africa south korea spain sri lanka sudan sweden switzerland syria taiwan thailand tunisia turkey ukraine ' +
    'united arab emirates united kingdom united states uruguay uzbekistan venezuela vietnam yemen zimbabwe america ' +
    'britain uk us usa uae eu england gaza west bank kyiv moscow washington beijing brussels'
  ).split(/\s+/).filter(Boolean),
);

const ORGS = new Set(
  (
    'un united nations nato eu european union imf world bank who unicef wto g7 g20 opec icj international court ' +
    'hamas hezbollah taliban isis islamic state houthis senate congress parliament white house pentagon state ' +
    'department ministry government army military police red cross amnesty human rights watch'
  ).split(/\s+/).filter(Boolean),
);

const NAME_HINTS = new Set([
  'president', 'prime minister', 'minister', 'secretary', 'chancellor', 'minister of', 'foreign minister',
  'trump', 'biden', 'harris', 'putin', 'zelensky', 'netanyahu', 'starmer', 'macron', 'scholz', 'xi', 'modi',
]);

function canonicalPhrase(raw: string): string {
  const lower = raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return lower;
}

export function extractEntities(text: string): string[] {
  const found = new Set<string>();

  // Gazetteer matches
  const lower = text.toLowerCase();
  for (const entry of [...COUNTRIES, ...ORGS]) {
    if (entry.includes(' ') ? lower.includes(entry) : new RegExp(`\\b${entry}\\b`, 'i').test(text)) {
      found.add(entry);
    }
  }

  // Capitalized multi-word proper-noun phrases (max 4 words), with a verb-ish guard.
  const capitalized = text.match(/\b([A-Z][a-zA-Z]+(?:\s+(?:of\s+)?[A-Z][a-zA-Z]+){0,3})\b/g) ?? [];
  for (const phrase of capitalized) {
    const canon = canonicalPhrase(phrase);
    if (!canon) continue;
    const words = canon.split(' ');
    // Skip sentence-initial single capitalized words (likely common words), keep known hints & 2+ word phrases.
    if (words.length >= 2 || NAME_HINTS.has(canon)) {
      found.add(canon);
    }
  }

  // Strip common non-entity capitalized words.
  const noise = new Set([
    'the', 'a', 'an', 'this', 'that', 'and', 'but', 'for', 'with', 'after', 'before', 'new', 'says', 'said',
    'world', 'politics', 'news', 'today', 'latest', 'live', 'update', 'updated', 'breaking', 'first', 'last',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);
  const result = [...found].filter((e) => !noise.has(e));
  return result;
}

const CANONICAL_COUNTRIES = new Set([
  'afghanistan', 'algeria', 'argentina', 'australia', 'austria', 'bangladesh', 'belarus', 'belgium', 'bolivia',
  'brazil', 'bulgaria', 'canada', 'chile', 'china', 'colombia', 'croatia', 'cuba', 'cyprus', 'czechia', 'denmark',
  'ecuador', 'egypt', 'estonia', 'ethiopia', 'finland', 'france', 'georgia', 'germany', 'ghana', 'greece', 'haiti',
  'honduras', 'hungary', 'iceland', 'india', 'indonesia', 'iran', 'iraq', 'ireland', 'israel', 'italy', 'japan',
  'jordan', 'kazakhstan', 'kenya', 'kuwait', 'lebanon', 'libya', 'lithuania', 'luxembourg', 'malaysia', 'mexico',
  'moldova', 'morocco', 'myanmar', 'nepal', 'netherlands', 'new zealand', 'nicaragua', 'nigeria', 'north korea',
  'norway', 'pakistan', 'palestine', 'panama', 'peru', 'philippines', 'poland', 'portugal', 'qatar', 'romania',
  'russia', 'saudi arabia', 'serbia', 'singapore', 'slovakia', 'slovenia', 'somalia', 'south africa', 'south korea',
  'spain', 'sri lanka', 'sudan', 'sweden', 'switzerland', 'syria', 'taiwan', 'thailand', 'tunisia', 'turkey', 'ukraine',
  'uae', 'united kingdom', 'united states', 'uruguay', 'uzbekistan', 'venezuela', 'vietnam', 'yemen', 'zimbabwe',
]);

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states',
  america: 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  england: 'united kingdom',
};

const INTERNATIONAL_ORGS = [
  'united nations', 'nato', 'european union', 'imf', 'world bank', 'world health organization',
  'wto', 'g7', 'g20', 'opec', 'icj', 'red cross', 'unicef', 'unhcr',
];

export function internationalSignals(text: string): { countries: number; international: boolean } {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const c of [...CANONICAL_COUNTRIES, ...Object.keys(COUNTRY_ALIASES)]) {
    const match = c.includes(' ') ? lower.includes(c) : new RegExp(`\\b${c}\\b`).test(lower);
    if (match) found.add(COUNTRY_ALIASES[c] ?? c);
  }
  const orgMention = INTERNATIONAL_ORGS.some((o) =>
    o.includes(' ') ? lower.includes(o) : new RegExp(`\\b${o}\\b`).test(lower),
  );
  return { countries: found.size, international: found.size >= 2 || orgMention };
}
