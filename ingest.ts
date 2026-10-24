import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { FEEDS } from './config';
import type { Article, Outlet, Section } from './types';

type RawItem = Record<string, unknown>;

const parser = new Parser<Record<string, unknown>, RawItem>({
  timeout: 25000,
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['image', 'image'],
    ],
  },
});

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function stripHtml(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, ' ').trim();
}

interface IngestedItem {
  outlet: Outlet;
  headline: string;
  url: string;
  published_at: string;
  summary: string;
  image_url: string | null;
  feed_section: Section;
}

function parseDate(value: unknown): string {
  const d = typeof value === 'string' ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

async function withBackoff<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Exponential backoff with jitter, capped at 20s. More attempts give
      // transient failures (timeouts, resets) a better chance to recover so a
      // single flaky fetch doesn't leave an outlet a full cycle stale.
      const delay = Math.min(20000, 1000 * 2 ** i) * (0.8 + Math.random() * 0.4);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

async function fetchRss(url: string): Promise<RawItem[]> {
  const feed = await withBackoff(() => parser.parseURL(url));
  return (feed.items ?? []).map((i) => i as unknown as RawItem);
}

async function fetchGuardian(url: string): Promise<RawItem[]> {
  const json = await withBackoff(async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Guardian HTTP ${res.status}`);
    return (await res.json()) as { response?: { results?: Record<string, unknown>[] } };
  });
  return json.response?.results ?? [];
}

const BAD_IMAGE = /(pixel|tracking|spacer|1x1|blank|placeholder|\.svg|icon|logo|globe)/i;

function extractImage(item: RawItem): string | null {
  const candidates: string[] = [];

  const enclosure = item.enclosure as { url?: string } | undefined;
  if (enclosure?.url) candidates.push(enclosure.url);

  // Some feeds (e.g. Anadolu) put the image URL in a bare <image> item field.
  const imageField = item.image as string | { url?: string } | undefined;
  if (typeof imageField === 'string' && imageField.trim()) candidates.push(imageField.trim());
  else if (imageField && typeof imageField === 'object' && imageField.url) candidates.push(imageField.url);

  for (const raw of [item['media:content'], item['media:thumbnail'], item.mediaContent, item.mediaThumbnail]) {
    if (!raw) continue;
    const arr = Array.isArray(raw) ? (raw as unknown[]) : [raw];
    for (const entry of arr) {
      const e = entry as { $?: { url?: string }; url?: string };
      const u = e?.$?.url ?? e?.url;
      if (u) candidates.push(u);
    }
  }

  // Fallback: <img> inside the item's HTML content.
  const html = firstString(item['content:encoded'], item.content, item.description);
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    if (m[1]) candidates.push(m[1]);
  }

  return candidates.find((u) => !BAD_IMAGE.test(u)) ?? null;
}

// Some CDNs (e.g. NPR's brightspotcdn.com) refuse hotlinking but embed the
// original asset URL in a ?url= query param. Prefer that origin directly.
export function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/brightspotcdn\.com$/i.test(u.hostname)) {
      const inner = u.searchParams.get('url');
      if (inner) return inner.replace(/^http:/, 'https:');
    }
  } catch {
    // ignore malformed URLs
  }
  return url;
}

function rssItem(item: RawItem, outlet: Outlet, section: Section): IngestedItem | null {
  const headline = firstString(item.title);
  const url = firstString(item.link);
  if (!headline || !url) return null;

  const summary = stripHtml(
    firstString(item['content:encoded'], item.content, item.description, item.summary, item.contentSnippet),
  );

  const imageUrl = extractImage(item);

  return {
    outlet,
    headline,
    url,
    published_at: parseDate(item.isoDate ?? item.pubDate ?? item.pubdate),
    summary,
    image_url: imageUrl ? normalizeImageUrl(imageUrl) : null,
    feed_section: section,
  };
}

function guardianItem(item: RawItem, outlet: Outlet, section: Section): IngestedItem | null {
  const headline = firstString(item.webTitle);
  const url = firstString(item.webUrl);
  if (!headline || !url) return null;
  const fields = (item.fields ?? {}) as Record<string, unknown>;
  return {
    outlet,
    headline,
    url,
    published_at: parseDate(item.webPublicationDate),
    summary: firstString(fields.trailText),
    image_url: firstString(fields.thumbnail) || null,
    feed_section: section,
  };
}

export interface FeedHealth {
  outlet: Outlet;
  section: Section;
  ok: boolean;
  items: number;
  error: string | null;
}

export async function ingest(): Promise<{ articles: Article[]; health: FeedHealth[] }> {
  const seen = new Set<string>();
  const articles: Article[] = [];
  const health: FeedHealth[] = [];

  const CONCURRENCY = 3;
  let cursor = 0;
  async function worker() {
    while (cursor < FEEDS.length) {
      const feed = FEEDS[cursor++];
      let ok = false;
      let error: string | null = null;
      let count = 0;
      try {
        const items = feed.kind === 'rss' ? await fetchRss(feed.url) : await fetchGuardian(feed.url);
        ok = true;
        for (const item of items) {
          const parsed =
            feed.kind === 'rss' ? rssItem(item, feed.outlet, feed.section) : guardianItem(item, feed.outlet, feed.section);
          if (!parsed) continue;
          const key = `${parsed.outlet}|${parsed.url}`;
          if (seen.has(key)) continue;
          seen.add(key);
          count++;
          articles.push({
            ...parsed,
            body_text: '',
            body_incomplete: false,
            analysis: null,
            analysis_status: 'pending',
            analysis_provider: '',
            analysis_model: '',
          });
        }
      } catch (err) {
        error = (err as Error).message;
        console.warn(`[ingest] failed ${feed.outlet}/${feed.section}:`, error);
      }
      health.push({ outlet: feed.outlet, section: feed.section, ok, items: count, error });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, FEEDS.length) }, () => worker()));

  return { articles, health };
}

function imageFromHtml(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:image"]').attr('content');
  // Skip generic og:image fallbacks (logos, defaults, share images) so they
  // don't become the article image.
  const ogReal = og && !/(logo|default|share|placeholder|fallback)/i.test(og) ? og : null;
  // Prefer the article's featured image, avoiding site logos/icons.
  const candidates = [
    $('img.wp-post-image').first().attr('src'),
    $('img.attachment-post-thumbnail').first().attr('src'),
    $('article img').first().attr('src'),
    $('figure img').first().attr('src'),
  ];
  let img = ogReal || candidates.find(Boolean) || null;
  if (!img) {
    img =
      $('img')
        .get()
        .map((el) => $(el).attr('src'))
        .filter((s): s is string => !!s && !/logo|\.svg$|icon|counter|watch|pixel|tracking/i.test(s))[0] ?? null;
  }
  const raw = img || null;
  if (!raw) return null;
  let resolved: string;
  try {
    resolved = new URL(raw, baseUrl).toString();
  } catch {
    resolved = raw;
  }
  return normalizeImageUrl(resolved);
}

export async function fetchArticleBody(
  url: string,
  fallback: string,
): Promise<{ body: string; incomplete: boolean; image: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'SameStoryDifferentLens/1.0 (news comparison; contact: local)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { body: fallback, incomplete: true, image: null };
    const html = await res.text();
    const image = imageFromHtml(html, url);
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, header, footer, aside, form, figure, iframe').remove();
    const container = $('article').length ? $('article') : $('body');
    const paras = container
      .find('p')
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((t) => t.length > 20);
    let body = paras.join('\n\n');
    if (body.length < 200) {
      body = $('body').text().replace(/\s+/g, ' ').trim();
    }
    if (!body || body.length < 60) return { body: fallback, incomplete: true, image };
    return { body, incomplete: false, image };
  } catch {
    return { body: fallback, incomplete: true, image: null };
  }
}

// Lightweight: fetch only the article's main image (og:image or first <img>).
export async function fetchImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'SameStoryDifferentLens/1.0 (news comparison; contact: local)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return imageFromHtml(html, url);
  } catch {
    return null;
  }
}
