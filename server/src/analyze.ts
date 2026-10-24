import type { Analysis, Article, Cluster, SingleItem } from './types';
import { currentLlmMode } from './config';
import { fetchArticleBody, fetchImage, normalizeImageUrl } from './ingest';
import { criticizeArticle } from './llm/critic';
import { createProvider, MockProvider, type AnalysisProvider } from './llm/providers';

// Fallback used when the real LLM is unreachable / out of balance, so analysis
// (and the sentiment bar) still completes — tagged 'mock' for transparency.
const mockProvider = new MockProvider();

export type AnalysisCache = Map<string, Analysis>;

export function loadCache(clusters: Cluster[]): AnalysisCache {
  const cache: AnalysisCache = new Map();
  for (const cluster of clusters) {
    for (const article of cluster.articles) {
      if (article.analysis && article.analysis_status === 'done') {
        cache.set(article.url, article.analysis);
      }
    }
  }
  return cache;
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function analyzeAll(clusters: Cluster[], provider: AnalysisProvider, cache: AnalysisCache): Promise<void> {
  // 1. Reuse cached per-article analyses (by URL) so refreshes don't re-bill the LLM.
  const pending: Article[] = [];
  for (const cluster of clusters) {
    for (const article of cluster.articles) {
      const cached = cache.get(article.url);
      if (cached) {
        article.analysis = cached;
        article.analysis_status = 'done';
      } else {
        pending.push(article);
      }
    }
  }

  // 2. Fetch bodies for every article lacking one (cached analyses wouldn't re-fetch otherwise).
  const allArticles = clusters.flatMap((c) => c.articles);
  await mapConcurrent(allArticles, 8, async (article) => {
    if (article.body_text && article.body_text.length > 40) return;
    try {
      const { body, incomplete, image } = await fetchArticleBody(article.url, article.summary);
      article.body_text = body;
      article.body_incomplete = incomplete;
      if (image && !article.image_url) article.image_url = image;
    } catch {
      article.body_incomplete = true;
    }
  });

  const mode = currentLlmMode();
  await mapConcurrent(pending, 4, async (article) => {
    try {
      article.analysis = await provider.analyzeArticle(article);
      article.analysis_status = 'done';
      article.analysis_provider = mode.provider;
      article.analysis_model = mode.model;
      cache.set(article.url, article.analysis as Analysis);
    } catch (err) {
      console.warn(`[analyze] LLM failed ${article.outlet}, using mock fallback:`, (err as Error).message);
      try {
        article.analysis = await mockProvider.analyzeArticle(article);
        article.analysis_status = 'done';
        article.analysis_provider = 'mock';
        article.analysis_model = '';
      } catch {
        article.analysis_status = 'failed';
      }
    }
  });

  // 3. Cluster-level comparison summary.
  for (const cluster of clusters) {
    const analyzed = cluster.articles.filter((a) => a.analysis && a.analysis_status === 'done');
    if (analyzed.length < 2) continue;
    try {
      const summary = await provider.summarizeCluster(cluster);
      cluster.consensus_facts = summary.consensus_facts;
      cluster.comparison_summary = {
        divergence_report: summary.divergence_report,
        spectrum_summary: summary.spectrum_summary,
        agreement_matrix: summary.agreement_matrix,
        verdict: summary.verdict,
      };
    } catch (err) {
      console.warn('[analyze] cluster summary failed:', (err as Error).message);
      cluster.comparison_summary = null;
    }
  }
}

export async function analyzeSingles(singles: SingleItem[], provider: AnalysisProvider, cache: AnalysisCache): Promise<void> {
  const pending: SingleItem[] = [];
  for (const s of singles) {
    const cached = cache.get(s.url);
    if (cached) {
      s.analysis = cached;
      s.analysis_status = 'done';
    } else if (!s.analysis) {
      pending.push(s);
    }
  }

  await mapConcurrent(singles, 8, async (s) => {
    if (s.body_text && s.body_text.length > 40) return;
    try {
      const { body, incomplete, image } = await fetchArticleBody(s.url, s.summary);
      s.body_text = body;
      s.body_incomplete = incomplete;
      if (image && !s.image_url) s.image_url = image;
    } catch {
      s.body_incomplete = true;
    }
  });

  const mode = currentLlmMode();
  await mapConcurrent(pending, 4, async (s) => {
    try {
      s.analysis = await provider.analyzeArticle(s);
      s.analysis_status = 'done';
      s.analysis_provider = mode.provider;
      s.analysis_model = mode.model;
      cache.set(s.url, s.analysis as Analysis);
    } catch (err) {
      console.warn(`[analyze] LLM failed single ${s.outlet}, using mock fallback:`, (err as Error).message);
      try {
        s.analysis = await mockProvider.analyzeArticle(s);
        s.analysis_status = 'done';
        s.analysis_provider = 'mock';
        s.analysis_model = '';
      } catch {
        s.analysis_status = 'failed';
      }
    }
  });
}

// Run the Critic over every analyzed article, attaching an automated
// verification score. Best-effort: a failed verification leaves the article
// unverified rather than failing the crawl.
export async function verifyArticles(articles: Article[], provider: AnalysisProvider): Promise<void> {
  const toVerify = articles.filter((a) => a.analysis && a.analysis_status === 'done');
  await mapConcurrent(toVerify, 4, async (a) => {
    try {
      const verification = await criticizeArticle(a, a.analysis as Analysis, provider);
      a.verification = verification;
      a.verification_score = verification.score;
    } catch (err) {
      console.warn(`[verify] failed ${a.outlet}:`, (err as Error).message);
    }
  });
}

export async function enrichImages(articles: Article[]): Promise<void> {
  await mapConcurrent(articles, 6, async (a) => {
    // Normalize CDN URLs that hotlink-block (e.g. NPR brightspot -> S3 origin).
    if (a.image_url) a.image_url = normalizeImageUrl(a.image_url);
    // Skip when a real image is already present, but re-fetch (or clear) when
    // the stored value is a tracking pixel, logo, generic icon, or fallback.
    if (a.image_url && !/(pixel|tracking|spacer|1x1|logo|default|share|globe|icon|\.svg)/i.test(a.image_url)) return;
    const img = await fetchImage(a.url);
    a.image_url = img ?? null;
  });
}

export { createProvider };
