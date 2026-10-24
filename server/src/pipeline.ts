import { analyzeAll, analyzeSingles, createProvider, enrichImages, loadCache, verifyArticles } from './analyze';
import { Archive } from './archive';
import { buildClusters, mergeWithHistory } from './cluster';
import { ingest, type FeedHealth } from './ingest';
import { Store } from './store';
import type { Cluster, OutletCrawlHealth } from './types';

export async function runPipeline(store: Store, archive?: Archive): Promise<Cluster[]> {
  const provider = createProvider();
  const cache = loadCache(store.clusters);

  const { articles, health } = await ingest();
  const crawledAt = new Date().toISOString();
  const { clusters, singles } = buildClusters(articles);

  // Merge into the previous crawl's stories so follow-ups accumulate and the
  // story keeps a stable id across crawls.
  const merged = mergeWithHistory(clusters, store.clusters);
  await analyzeAll(merged, provider, cache);
  await analyzeSingles(singles, provider, cache);
  await verifyArticles([...merged.flatMap((c) => c.articles), ...singles], provider);
  await enrichImages([...merged.flatMap((c) => c.articles), ...singles]);

  // Stamp each article with how many distinct outlets covered its story, so the
  // archive can reconstruct corroboration tiers and authenticity later.
  for (const c of merged) {
    const n = new Set(c.articles.map((a) => a.outlet)).size;
    for (const a of c.articles) a.source_count = n;
  }
  for (const s of singles) s.source_count = 1;

  if (archive) {
    // Archive the ANALYZED objects (clusters + singles), not the raw ingest list,
    // so single-source reports are persisted with their analysis and source_count.
    const added = archive.append([...merged.flatMap((c) => c.articles), ...singles], crawledAt);
    console.log(`[archive] +${added} new articles (${archive.size} total)`);
  }

  store.save(merged, singles, {
    lastUpdated: crawledAt,
    lastError: null,
    stale: false,
    crawlHealth: aggregateHealth(health, crawledAt, store.crawlHealth),
  });

  return merged;
}

function aggregateHealth(
  feeds: FeedHealth[],
  checkedAt: string,
  previous: Record<string, OutletCrawlHealth>,
): Record<string, OutletCrawlHealth> {
  const byOutlet = new Map<string, { feeds: number; ok: number; items: number; error: string | null }>();
  for (const f of feeds) {
    const h = byOutlet.get(f.outlet) ?? { feeds: 0, ok: 0, items: 0, error: null };
    h.feeds++;
    if (f.ok) h.ok++;
    else if (!h.error) h.error = f.error;
    h.items += f.items;
    byOutlet.set(f.outlet, h);
  }
  const out: Record<string, OutletCrawlHealth> = {};
  for (const [outlet, h] of byOutlet) {
    const ok = h.ok === h.feeds;
    out[outlet] = {
      outlet,
      feeds: h.feeds,
      ok_feeds: h.ok,
      items: h.items,
      ok,
      error: h.error,
      checked_at: checkedAt,
      // Carry forward the last successful crawl so stale outlets stay visible
      // even after a failed cycle.
      last_success: ok ? checkedAt : previous[outlet]?.last_success ?? null,
    };
  }
  return out;
}
