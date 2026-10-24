import type { Article } from './types';
import { fetchImage } from './ingest';

export interface BrokenImage {
  outlet: string;
  headline: string;
  url: string;
  status: number | null; // null = network error / timeout
}

export interface BrokenLink {
  outlet: string;
  headline: string;
  url: string;
  status: number | null;
}

export interface DuplicateImage {
  url: string;
  count: number; // how many distinct articles share this image
  articles: { outlet: string; headline: string }[]; // the ones we couldn't fix
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function probeUrl(url: string): Promise<number | null> {
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    // Some servers don't support HEAD — retry with a ranged GET (first byte).
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        headers: { 'user-agent': UA, range: 'bytes=0-0' },
        signal: AbortSignal.timeout(10000),
      });
    }
    return res.status;
  } catch {
    return null;
  }
}

async function scan(articles: Article[], pick: (a: Article) => string | null): Promise<{ outlet: string; headline: string; url: string; status: number | null }[]> {
  const queue = articles.map((a) => ({ a, url: pick(a) })).filter((x): x is { a: Article; url: string } => !!x.url);
  const broken: { outlet: string; headline: string; url: string; status: number | null }[] = [];
  const CONCURRENCY = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const { a, url } = queue[cursor++];
      const status = await probeUrl(url);
      if (status == null || status >= 400) {
        broken.push({ outlet: a.outlet, headline: a.headline, url, status });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));
  return broken;
}

// Scan article image URLs for broken / unreachable images. Advisory: some CDNs
// hotlink-block server requests but work in a browser.
export function checkImages(articles: Article[]): Promise<BrokenImage[]> {
  return scan(articles, (a) => a.image_url);
}

// Scan article (original-news) URLs for broken links. A 403 here often means
// bot-protection rather than a truly dead link, so treat results as advisory.
export function checkLinks(articles: Article[]): Promise<BrokenLink[]> {
  return scan(articles, (a) => a.url);
}

// Find articles sharing the same image URL and try to give the duplicates a
// distinct image (re-fetch from their article page). Mutates the passed
// articles in place when a different image is found. Same-story wire photos are
// legitimately identical, so they'll simply remain and be reported.
export async function dedupeImages(articles: Article[]): Promise<{ resolved: number; duplicates: DuplicateImage[] }> {
  const groups = new Map<string, Article[]>();
  for (const a of articles) {
    if (!a.image_url || /(pixel|tracking|spacer|1x1)/i.test(a.image_url)) continue;
    const arr = groups.get(a.image_url) ?? [];
    arr.push(a);
    groups.set(a.image_url, arr);
  }

  let resolved = 0;
  const duplicates: DuplicateImage[] = [];
  for (const [url, arts] of groups) {
    if (arts.length < 2) continue;
    // Same outlet appearing twice is usually follow-up coverage of one story,
    // legitimately sharing the outlet's image — skip those.
    if (new Set(arts.map((a) => a.outlet)).size === 1) continue;
    const used = new Set<string>([url]);
    const remaining: { outlet: string; headline: string }[] = [];
    for (let i = 1; i < arts.length; i++) {
      const a = arts[i];
      try {
        const img = await fetchImage(a.url);
        if (img && !used.has(img) && !/(pixel|tracking|spacer|1x1)/i.test(img)) {
          a.image_url = img;
          used.add(img);
          resolved++;
          continue;
        }
      } catch {
        // fall through to remaining
      }
      remaining.push({ outlet: a.outlet, headline: a.headline });
    }
    if (remaining.length > 0) {
      duplicates.push({ url, count: arts.length, articles: remaining });
    }
  }
  return { resolved, duplicates };
}
