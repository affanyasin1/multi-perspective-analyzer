import { config } from './config';
import { internationalSignals } from './entities';
import { tokenize, tokenizeNgrams } from './normalize';
import type { Article, Cluster, Section, SingleItem } from './types';
import { OUTLET_ORDER } from './types';

interface Vector {
  tfidf: Map<string, number>;
  headlineTokens: Set<string>;
}

export function buildTfidf(text: string, df: Map<string, number>, totalDocs: number): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokenizeNgrams(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  const v = new Map<string, number>();
  for (const [term, count] of tf) {
    const idf = Math.log((totalDocs + 1) / ((df.get(term) ?? 0) + 1)) + 1;
    v.set(term, count * idf);
  }
  return v;
}

function buildVector(text: string, headline: string, df: Map<string, number>, totalDocs: number): Vector {
  return { tfidf: buildTfidf(text, df, totalDocs), headlineTokens: new Set(tokenize(headline)) };
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, weight] of a) {
    normA += weight * weight;
    if (b.has(term)) dot += weight * (b.get(term) as number);
  }
  for (const weight of b.values()) normB += weight * weight;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function hashId(urls: string[]): string {
  const sorted = [...urls].sort().join('|');
  let h = 0;
  for (let i = 0; i < sorted.length; i++) {
    h = (h * 31 + sorted.charCodeAt(i)) >>> 0;
  }
  return `c${h.toString(16)}`;
}

function isEnglish(text: string): boolean {
  // Quick heuristic: reject text with a high proportion of non-Latin scripts.
  const nonLatin = text.match(/[\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u3040-\u30ff\u4e00-\u9fff]/g);
  const total = text.length || 1;
  return (nonLatin?.length ?? 0) / total < 0.15;
}

export interface StorySet {
  clusters: Cluster[]; // stories covered by 2+ distinct outlets
  singles: SingleItem[]; // single-source reports (1 outlet only)
}

export function buildClusters(articles: Article[]): StorySet {
  const filtered = articles.filter((a) => a.feed_section === 'world' || a.feed_section === 'politics');
  const english = filtered.filter((a) => isEnglish(`${a.headline} ${a.summary}`));

  // Document frequencies across the corpus (unigrams + bigrams).
  const corpusText = english.map((a) => `${a.headline} ${a.summary}`);
  const df = new Map<string, number>();
  for (const text of corpusText) {
    for (const term of new Set(tokenizeNgrams(text))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const vectors = english.map((a) => buildVector(`${a.headline} ${a.summary}`, a.headline, df, english.length));

  const uf = new UnionFind(english.length);
  const { similarityThreshold, jaccardThreshold, sameOutletSimilarity, sameOutletJaccard, maxDaySpan } = config.cluster;

  for (let i = 0; i < english.length; i++) {
    for (let j = i + 1; j < english.length; j++) {
      const daySpan =
        Math.abs(new Date(english[i].published_at).getTime() - new Date(english[j].published_at).getTime()) / 86400000;
      if (daySpan > maxDaySpan) continue;

      const sim = cosine(vectors[i].tfidf, vectors[j].tfidf);
      const jac = jaccard(vectors[i].headlineTokens, vectors[j].headlineTokens);
      const sameOutlet = english[i].outlet === english[j].outlet;

      // Same outlet: only merge near-duplicates/follow-ups. Different outlets:
      // rely on cosine + headline overlap.
      const sameStory = sameOutlet
        ? jac >= sameOutletJaccard || sim >= sameOutletSimilarity
        : sim >= similarityThreshold || jac >= jaccardThreshold;

      if (sameStory) uf.union(i, j);
    }
  }

  const groups = new Map<number, Article[]>();
  english.forEach((a, idx) => {
    const root = uf.find(idx);
    const list = groups.get(root) ?? [];
    list.push(a);
    groups.set(root, list);
  });

  const clusters: Cluster[] = [];
  const singleArticles: SingleItem[] = [];

  for (const members of groups.values()) {
    const outlets = new Set(members.map((m) => m.outlet));
    const sorted = [...members].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    const newest = sorted[0].published_at;

    if (outlets.size < config.cluster.minOutlets) {
      // Single-source report: keep the most recent article as the representative.
      const rep = sorted[0];
      const { countries, international } = internationalSignals(`${rep.headline}. ${rep.summary}`);
      singleArticles.push({ ...rep, id: hashId([rep.url]), countries, international });
      continue;
    }

    // topic_label: most neutral headline — prefer wire service order.
    const chosen =
      OUTLET_ORDER.map((o) => sorted.find((m) => m.outlet === o)).find(Boolean) ?? sorted[0];

    const sections = members.map((m) => m.feed_section);
    const section: Section = sections.filter((s) => s === 'politics').length >= sections.length / 2 ? 'politics' : 'world';

    clusters.push({
      id: hashId(members.map((m) => m.url)),
      topic_label: chosen.headline,
      section,
      consensus_facts: [],
      articles: sorted,
      comparison_summary: null,
      score: 0,
      updated_at: newest,
    });
  }

  // Rank clusters: distinct outlets desc -> newest desc -> size desc.
  clusters.sort((a, b) => {
    const outletsDiff = new Set(b.articles.map((x) => x.outlet)).size - new Set(a.articles.map((x) => x.outlet)).size;
    if (outletsDiff !== 0) return outletsDiff;
    const dateDiff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.articles.length - a.articles.length;
  });

  clusters.forEach((c, idx) => {
    c.score = 100 - idx;
  });

  // Sort singles: international-first, then newest-first, then cap.
  const singles = singleArticles
    .sort((a, b) => {
      if (a.international !== b.international) return a.international ? -1 : 1;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    })
    .slice(0, config.singlesLimit);

  return { clusters: clusters.slice(0, config.topN), singles };
}

export { OUTLET_ORDER };

function storySimilar(a: Cluster, b: Cluster): boolean {
  const aUrls = new Set(a.articles.map((x) => x.url));
  const bUrls = new Set(b.articles.map((x) => x.url));
  for (const u of aUrls) if (bUrls.has(u)) return true;

  const textA = a.articles.map((x) => `${x.headline}. ${x.summary}`).join(' ').toLowerCase();
  const textB = b.articles.map((x) => `${x.headline}. ${x.summary}`).join(' ').toLowerCase();
  const sim = jaccard(new Set(tokenizeNgrams(textA)), new Set(tokenizeNgrams(textB)));
  const jac = jaccard(new Set(tokenize(a.articles[0]?.headline ?? '')), new Set(tokenize(b.articles[0]?.headline ?? '')));

  return jac >= 0.5 || sim >= 0.15;
}

// Link each freshly-built cluster to its previous instance (if any) so a story
// keeps a stable id and accumulates its follow-up articles over time.
export function mergeWithHistory(current: Cluster[], previous: Cluster[]): Cluster[] {
  const used = new Set<string>();
  return current.map((c) => {
    let matched: Cluster | undefined;
    for (const p of previous) {
      if (used.has(p.id)) continue;
      if (storySimilar(c, p)) {
        matched = p;
        break;
      }
    }
    if (!matched) return c;

    used.add(matched.id);
    const freshByUrl = new Map(c.articles.map((a) => [a.url, a]));
    const seen = new Set<string>();
    const articles = [...matched.articles, ...c.articles]
      .filter((a) => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      })
      .map((a) => {
        // Refresh the image from the fresh crawl when the kept article holds a
        // missing or tracking-pixel image, so extraction fixes propagate to
        // already-seen stories.
        const fresh = freshByUrl.get(a.url);
        if (fresh && (!a.image_url || /(pixel|tracking|spacer|1x1)/i.test(a.image_url)) && fresh.image_url) {
          a.image_url = fresh.image_url;
        }
        return a;
      })
      .sort((x, y) => new Date(y.published_at).getTime() - new Date(x.published_at).getTime())
      .slice(0, 60);

    return { ...c, id: matched.id, articles, updated_at: articles[0].published_at };
  });
}
