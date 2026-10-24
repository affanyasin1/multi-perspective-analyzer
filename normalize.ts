const STOPWORDS = new Set(
  (
    'a about above after again against all am an and any are as at be because been before being below ' +
    'between both but by can did do does doing down during each few for from further had has have having he her here ' +
    'hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off ' +
    'on once only or other our ours ourselves out over own same she should so some such than that the their theirs them ' +
    'themselves then there these they this those through to too under until up very was we were what when where which ' +
    'while who whom why will with you your yours yourself yourselves could would might must shall said says say ' +
    'according per cent percent new says told reported reports report saying after before week month year day today ' +
    'yesterday tomorrow amid among via its his their our news world politics'
  ).split(/\s+/).filter(Boolean),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// --- Porter stemmer (standard algorithm) ---
function isConsonant(word: string, i: number): boolean {
  const c = word[i];
  if ('aeiou'.includes(c)) return false;
  if (c === 'y') return i === 0 ? true : !isConsonant(word, i - 1);
  return true;
}

function measure(word: string): number {
  let count = 0;
  for (let i = 1; i < word.length; i++) {
    if (isConsonant(word, i) && !isConsonant(word, i - 1)) count++;
  }
  return count;
}

function containsVowel(word: string): boolean {
  return /[aeiouy]/.test(word);
}

function endsWithDoubleConsonant(word: string): boolean {
  const c = word[word.length - 1];
  return c === word[word.length - 2] && c !== 'w' && c !== 'x' && c !== 'y' && isConsonant(word, word.length - 1);
}

function endsCVC(word: string): boolean {
  const n = word.length;
  if (n < 3) return false;
  return (
    !isConsonant(word, n - 3) &&
    isConsonant(word, n - 2) &&
    !isConsonant(word, n - 1) &&
    !'wxy'.includes(word[n - 1])
  );
}

function replaceSuffix(word: string, suffixes: [string, string][]): string {
  for (const [suffix, replacement] of suffixes) {
    if (word.endsWith(suffix)) return word.slice(0, -suffix.length) + replacement;
  }
  return word;
}

export function stem(word: string): string {
  let w = word;

  // Step 1a
  if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ies')) w = w.slice(0, -2);
  else if (w.endsWith('ss')) w = w;
  else if (w.endsWith('s')) w = w.slice(0, -1);

  // Step 1b
  let flag = false;
  if (w.endsWith('eed')) {
    const stemPart = w.slice(0, -3);
    if (measure(stemPart) > 0) w = stemPart + 'ee';
  } else if (w.endsWith('ed')) {
    const stemPart = w.slice(0, -2);
    if (containsVowel(stemPart)) {
      w = stemPart;
      flag = true;
    }
  } else if (w.endsWith('ing')) {
    const stemPart = w.slice(0, -3);
    if (containsVowel(stemPart)) {
      w = stemPart;
      flag = true;
    }
  }
  if (flag) {
    if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
    else if (endsWithDoubleConsonant(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCVC(w)) w += 'e';
  }

  // Step 1c
  if (w.endsWith('y') && containsVowel(w.slice(0, -1))) w = w.slice(0, -1) + 'i';

  // Step 2
  w = replaceSuffix(w, [
    ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'], ['izer', 'ize'],
    ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'], ['eli', 'e'], ['ousli', 'ous'],
    ['ization', 'ize'], ['ation', 'ate'], ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'],
    ['fulness', 'ful'], ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
    ['logi', 'log'],
  ]);

  // Step 3
  w = replaceSuffix(w, [
    ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'], ['ical', 'ic'],
    ['ful', ''], ['ness', ''],
  ]);

  // Step 4
  for (const suffix of ['ement', 'ance', 'ence', 'able', 'ible', 'ment', 'ant', 'ent', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize', 'al', 'er', 'ic']) {
    if (w.endsWith(suffix)) {
      const stemPart = w.slice(0, -suffix.length);
      if (measure(stemPart) > 1) {
        w = stemPart;
        break;
      }
    }
  }

  // Step 5a
  if (w.endsWith('e')) {
    const stemPart = w.slice(0, -1);
    if (measure(stemPart) > 1 || (measure(stemPart) === 1 && !endsCVC(stemPart))) w = stemPart;
  }

  // Step 5b
  if (measure(w) > 1 && endsWithDoubleConsonant(w) && w.endsWith('l')) w = w.slice(0, -1);

  return w;
}

export function normalizeTokens(text: string): string[] {
  return tokenize(text).map(stem);
}

// Unigrams + adjacent bigrams (as "a_b"), which captures phrases like
// "riyadh_airport" and greatly improves same-story matching.
export function tokenizeNgrams(text: string): string[] {
  const tokens = normalizeTokens(text);
  const out: string[] = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    out.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return out;
}
