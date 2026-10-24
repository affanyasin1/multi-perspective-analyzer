import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { tokenizeNgrams } from './normalize';
import { buildTfidf, cosine } from './cluster';
import { localParts, OUTLET_TIMEZONES } from './timezones';
import type { Analysis, Cluster, Outlet, SingleItem } from './types';

interface ArchiveRecord {
  crawled_at: string;
  outlet: string;
  headline: string;
  url: string;
  summary: string;
  body_text: string;
  image_url: string | null;
  published_at: string;
  feed_section: string;
  body_incomplete: boolean;
  analysis: Analysis | null;
  analysis_provider?: string;
  analysis_model?: string;
  analysis_status?: string;
  source_count?: number;
}

function readRecords(): ArchiveRecord[] {
  const file = path.resolve(__dirname, '..', '..', config.archiveFile);
  const out: ArchiveRecord[] = [];
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as ArchiveRecord);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function leanOf(rating: string): number {
  switch (rating) {
    case 'left':
      return -1;
    case 'lean-left':
      return -0.5;
    case 'lean-right':
      return 0.5;
    case 'right':
      return 1;
    default:
      return 0;
  }
}

export interface TopicInsight {
  topic: string;
  count: number;
  outlets: string[];
  days: number; // distinct days the topic spans
  latest: string;
  score: number; // trend score (volume + breadth + persistence + recency)
}

export interface OutletAuthenticity {
  outlet: string;
  total: number;
  recent: number;
  corroborated: number;
  corroboration_rate: number;
  avg_sentiment_deviation: number | null; // 0..1, distance from cluster mean
  avg_bias_deviation: number | null; // 0..1
  authenticity: number; // 0..100 = corroboration_rate * (1 - deviation)
  label: string;
}

export interface ShiftSide {
  date: string;
  sentiment: number;
  bias: string;
  headline: string;
  url: string;
  framing: string;
}

export interface ShiftFlag {
  story_id: string;
  story: string;
  outlet: string;
  from: ShiftSide;
  to: ShiftSide;
  delta: number;
}

export interface DataQuality {
  total: number;
  with_image: number;
  pct_image: number;
  full_body: number;
  paywalled: number;
  pct_paywalled: number;
  analyzed: number;
  failed: number;
  pct_analyzed: number;
  real_llm: number;
  mock: number;
  pct_real: number;
}

export interface CorroborationTiers {
  today: { single: number; two: number; three_plus: number };
  all_time: { single: number; two: number; three_plus: number };
}

export interface SentimentHistogramBucket {
  bucket: string;
  count: number;
}

export interface DriftPoint {
  date: string;
  avg: number;
}

export interface OutletSentimentDrift {
  outlet: string;
  points: DriftPoint[];
}

export interface PostingCadence {
  by_hour: { hour: number; [outlet: string]: number | string }[];
  by_weekday: { weekday: string; [outlet: string]: number | string }[];
}

export interface CorroborationLag {
  median_hours: number | null;
  p25_hours: number | null;
  p75_hours: number | null;
  count: number;
}

export interface Insights {
  generated_at: string;
  articles_by_day: { date: string; count: number }[];
  outlets_by_day: { date: string; [outlet: string]: number | string }[];
  sentiment_by_outlet: { outlet: string; avg: number; count: number }[];
  topics: TopicInsight[];
  authenticity: OutletAuthenticity[];
  shifts: ShiftFlag[];
  data_quality: DataQuality;
  corroboration_tiers: CorroborationTiers;
  sentiment_histogram: SentimentHistogramBucket[];
  sentiment_drift: OutletSentimentDrift[];
  posting_cadence: PostingCadence;
  corroboration_lag: CorroborationLag;
}

function unionFind<T>(items: T[], related: (a: T, b: T) => boolean): T[][] {
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (related(items[i], items[j])) union(i, j);
    }
  }
  const groups = new Map<number, T[]>();
  items.forEach((item, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(item);
    groups.set(root, list);
  });
  return [...groups.values()];
}

export function buildInsights(clusters: Cluster[], singles: SingleItem[]): Insights {
  const records = readRecords();

  // --- trends ---
  const articleDays = new Map<string, number>();
  const outletDays = new Map<string, Map<string, number>>();
  const sentByOutlet = new Map<string, { sum: number; count: number }>();
  const outletSet = new Set<string>();

  for (const r of records) {
    outletSet.add(r.outlet);
    const d = dayKey(r.published_at);
    if (d) {
      articleDays.set(d, (articleDays.get(d) ?? 0) + 1);
      const od = outletDays.get(d) ?? new Map<string, number>();
      od.set(r.outlet, (od.get(r.outlet) ?? 0) + 1);
      outletDays.set(d, od);
    }
    if (r.analysis) {
      const s = sentByOutlet.get(r.outlet) ?? { sum: 0, count: 0 };
      s.sum += r.analysis.sentiment.score;
      s.count++;
      sentByOutlet.set(r.outlet, s);
    }
  }

  const outletsSorted = [...outletSet].sort();
  const articles_by_day = [...articleDays.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  const outlets_by_day = [...outletDays.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => {
      const row: { date: string; [outlet: string]: number | string } = { date };
      for (const o of outletsSorted) row[o] = counts.get(o) ?? 0;
      return row;
    });
  const sentiment_by_outlet = [...sentByOutlet.entries()]
    .map(([outlet, v]) => ({ outlet, avg: round2(v.sum / v.count), count: v.count }))
    .sort((a, b) => b.count - a.count);

  // --- topic / event detection (last 14 days) ---
  const now = Date.now();
  const recent = records.filter((r) => {
    const pd = new Date(r.published_at).getTime();
    return !Number.isNaN(pd) && now - pd < 14 * 86400000;
  });
  // TF-IDF vectors over the recent corpus, grouped by cosine similarity.
  const recentTexts = recent.map((r) => `${r.headline}. ${r.summary}`);
  const df = new Map<string, number>();
  for (const text of recentTexts) {
    for (const term of new Set(tokenizeNgrams(text))) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const vecs = recentTexts.map((text) => buildTfidf(text, df, recent.length));

  const n = recent.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cosine(vecs[i], vecs[j]) >= 0.3) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const l = groups.get(root) ?? [];
    l.push(i);
    groups.set(root, l);
  }

  const topics: TopicInsight[] = [...groups.values()]
    .map((idxs) => {
      const members = idxs.map((i) => recent[i]);
      const outlets = new Set(members.map((r) => r.outlet));
      const daySet = new Set(members.map((r) => dayKey(r.published_at)).filter(Boolean));
      if (members.length < 3 || outlets.size < 2 || daySet.size < 2) return null;

      // Representative headline = most central member (highest mean cosine).
      let bestIdx = idxs[0];
      let bestMean = -1;
      for (const i of idxs) {
        let sum = 0;
        for (const j of idxs) if (i !== j) sum += cosine(vecs[i], vecs[j]);
        const mean = sum / (idxs.length - 1);
        if (mean > bestMean) {
          bestMean = mean;
          bestIdx = i;
        }
      }

      const sorted = [...members].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
      const latest = sorted[0].published_at;
      const ageDays = (Date.now() - new Date(latest).getTime()) / 86400000;
      const recency = Math.max(0, 14 - ageDays) / 14; // 1 = today, 0 = 14 days old
      const score = Math.round((members.length + outlets.size * 3 + daySet.size * 2 + recency * 10) * 10) / 10;

      return {
        topic: recent[bestIdx].headline,
        count: members.length,
        outlets: [...outlets],
        days: daySet.size,
        latest,
        score,
      };
    })
    .filter((t): t is TopicInsight => t !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // --- authenticity ---
  const corr = new Map<string, { weight: number; corr: number; total: number; recent: number; rawCorr: number }>();
  const nowMs = Date.now();
  for (const r of records) {
    const ageDays = (nowMs - new Date(r.published_at).getTime()) / 86400000;
    const w = ageDays < 0 ? 1 : Math.pow(0.5, ageDays / 7);
    const c = corr.get(r.outlet) ?? { weight: 0, corr: 0, total: 0, recent: 0, rawCorr: 0 };
    c.total++;
    c.weight += w;
    if (ageDays <= 14) c.recent++;
    const corroborated = r.source_count != null ? r.source_count >= 2 : r.analysis != null;
    if (corroborated) {
      c.corr += w;
      c.rawCorr++;
    }
    corr.set(r.outlet, c);
  }
  const dev = new Map<string, { sum: number; n: number; biasSum: number; biasN: number }>();
  for (const c of clusters) {
    const analyzed = c.articles.filter((a) => a.analysis);
    if (analyzed.length < 2) continue;
    const meanSent = analyzed.reduce((s, a) => s + (a.analysis as Analysis).sentiment.score, 0) / analyzed.length;
    const meanLean = analyzed.reduce((s, a) => s + leanOf((a.analysis as Analysis).bias_rating.rating), 0) / analyzed.length;
    for (const a of analyzed) {
      const an = a.analysis as Analysis;
      const d = dev.get(a.outlet) ?? { sum: 0, n: 0, biasSum: 0, biasN: 0 };
      d.sum += Math.abs(an.sentiment.score - meanSent);
      d.n++;
      d.biasSum += Math.abs(leanOf(an.bias_rating.rating) - meanLean);
      d.biasN++;
      dev.set(a.outlet, d);
    }
  }

  const authenticity: OutletAuthenticity[] = outletsSorted.map((outlet) => {
    const c = corr.get(outlet) ?? { weight: 0, corr: 0, total: 0, recent: 0, rawCorr: 0 };
    const d = dev.get(outlet) ?? { sum: 0, n: 0, biasSum: 0, biasN: 0 };
    const rate = c.weight > 0 ? c.corr / c.weight : 0;
    const avgDev = d.n ? (d.sum / d.n) / 2 : null; // sentiment range is 2
    const avgBiasDev = d.biasN ? (d.biasSum / d.biasN) / 2 : null; // lean range is 2
    const consistency = avgDev == null ? 0.5 : Math.max(0, 1 - avgDev);
    const score = Math.round(100 * rate * consistency);
    const label =
      c.recent < 3
        ? 'Insufficient data'
        : rate >= 0.5
          ? 'Highly corroborated'
          : rate >= 0.2
            ? 'Moderately corroborated'
            : 'Seldom corroborated';
    return {
      outlet,
      total: c.total,
      recent: c.recent,
      corroborated: c.rawCorr,
      corroboration_rate: round2(rate),
      avg_sentiment_deviation: avgDev == null ? null : round2(avgDev),
      avg_bias_deviation: avgBiasDev == null ? null : round2(avgBiasDev),
      authenticity: score,
      label,
    };
  });

  // --- stance shifts ---
  const shifts: ShiftFlag[] = [];
  for (const c of clusters) {
    const byOutlet = new Map<string, typeof c.articles>();
    for (const a of c.articles) {
      if (!a.analysis) continue;
      const list = byOutlet.get(a.outlet) ?? [];
      list.push(a);
      byOutlet.set(a.outlet, list);
    }
    for (const [outlet, arts] of byOutlet) {
      if (arts.length < 2) continue;
      const sorted = [...arts].sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = new Date(last.published_at).getTime() - new Date(first.published_at).getTime();
      if (span < 3600000) continue; // ignore same-hour duplicates
      const delta = (last.analysis as Analysis).sentiment.score - (first.analysis as Analysis).sentiment.score;
      if (Math.abs(delta) >= 0.5) {
        const side = (a: (typeof c.articles)[number]) => ({
          date: a.published_at,
          sentiment: (a.analysis as Analysis).sentiment.score,
          bias: (a.analysis as Analysis).bias_rating.rating,
          headline: a.headline,
          url: a.url,
          framing: (a.analysis as Analysis).framing,
        });
        shifts.push({
          story_id: c.id,
          story: c.topic_label,
          outlet,
          from: side(first),
          to: side(last),
          delta: round2(delta),
        });
      }
    }
  }
  shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // --- data quality ---
  let withImage = 0;
  let fullBody = 0;
  let paywalled = 0;
  let analyzed = 0;
  let failed = 0;
  let realLlm = 0;
  let mockLlm = 0;
  for (const r of records) {
    if (r.image_url) withImage++;
    if (r.body_incomplete) paywalled++;
    else fullBody++;
    if (r.analysis) analyzed++;
    else if (r.analysis_status === 'failed') failed++;
    const prov = r.analysis_provider ?? (r.analysis ? 'mock' : '');
    if (prov && prov !== 'mock') realLlm++;
    else if (prov === 'mock') mockLlm++;
  }
  const total = records.length;
  const pct = (n: number) => (total ? round2((n / total) * 100) : 0);
  const data_quality: DataQuality = {
    total,
    with_image: withImage,
    pct_image: pct(withImage),
    full_body: fullBody,
    paywalled,
    pct_paywalled: pct(paywalled),
    analyzed,
    failed,
    pct_analyzed: pct(analyzed),
    real_llm: realLlm,
    mock: mockLlm,
    pct_real: pct(realLlm),
  };

  // --- corroboration tiers (today from live store, all-time from archive) ---
  const tiersToday = { single: singles.length, two: 0, three_plus: 0 };
  for (const c of clusters) {
    const k = new Set(c.articles.map((a) => a.outlet)).size;
    if (k === 2) tiersToday.two++;
    else if (k >= 3) tiersToday.three_plus++;
  }
  const tiersAll = { single: 0, two: 0, three_plus: 0 };
  for (const r of records) {
    const sc = r.source_count ?? (r.analysis ? 2 : 1);
    if (sc >= 3) tiersAll.three_plus++;
    else if (sc === 2) tiersAll.two++;
    else tiersAll.single++;
  }
  const corroboration_tiers: CorroborationTiers = { today: tiersToday, all_time: tiersAll };

  // --- sentiment histogram ---
  const buckets: [string, number, number][] = [
    ['negative', -1, -0.6],
    ['lean-negative', -0.6, -0.2],
    ['neutral', -0.2, 0.2],
    ['lean-positive', 0.2, 0.6],
    ['positive', 0.6, 1],
  ];
  const hist = new Map<string, number>();
  for (const r of records) {
    if (!r.analysis) continue;
    const s = r.analysis.sentiment.score;
    for (const [label, lo, hi] of buckets) {
      const inBucket = label === 'positive' ? s >= lo : s >= lo && s < hi;
      if (inBucket) {
        hist.set(label, (hist.get(label) ?? 0) + 1);
        break;
      }
    }
  }
  const sentiment_histogram = buckets.map(([label]) => ({ bucket: label, count: hist.get(label) ?? 0 }));

  // --- sentiment drift per outlet (3-day rolling average) ---
  const driftMap = new Map<string, Map<string, number[]>>();
  for (const r of records) {
    if (!r.analysis) continue;
    const d = dayKey(r.published_at);
    if (!d) continue;
    const perDay = driftMap.get(r.outlet) ?? new Map<string, number[]>();
    const arr = perDay.get(d);
    if (arr) arr.push(r.analysis.sentiment.score);
    else perDay.set(d, [r.analysis.sentiment.score]);
    driftMap.set(r.outlet, perDay);
  }
  const sentiment_drift: OutletSentimentDrift[] = [...driftMap.entries()]
    .map(([outlet, perDay]) => {
      const days = [...perDay.keys()].sort();
      const daily = days.map((d) => ({ date: d, avg: (perDay.get(d) as number[]).reduce((s, x) => s + x, 0) / (perDay.get(d) as number[]).length }));
      const points = daily.map((_, i) => {
        const lo = Math.max(0, i - 1);
        const hi = Math.min(daily.length - 1, i + 1);
        let sum = 0;
        let n = 0;
        for (let j = lo; j <= hi; j++) {
          sum += daily[j].avg;
          n++;
        }
        return { date: daily[i].date, avg: round2(sum / n) };
      });
      return { outlet, points };
    })
    .sort((a, b) => a.outlet.localeCompare(b.outlet));

  // --- posting cadence ---
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hourOutlets = new Map<number, Map<string, number>>();
  const weekdayOutlets = new Map<number, Map<string, number>>();
  for (const r of records) {
    const lp = localParts(r.published_at, OUTLET_TIMEZONES[r.outlet as Outlet] ?? 'UTC');
    if (!lp) continue;
    const hm = hourOutlets.get(lp.hour) ?? new Map<string, number>();
    hm.set(r.outlet, (hm.get(r.outlet) ?? 0) + 1);
    hourOutlets.set(lp.hour, hm);
    const wm = weekdayOutlets.get(lp.weekday) ?? new Map<string, number>();
    wm.set(r.outlet, (wm.get(r.outlet) ?? 0) + 1);
    weekdayOutlets.set(lp.weekday, wm);
  }
  const posting_cadence: PostingCadence = {
    by_hour: Array.from({ length: 24 }, (_, h) => {
      const row: { hour: number; [outlet: string]: number | string } = { hour: h };
      for (const o of outletsSorted) row[o] = hourOutlets.get(h)?.get(o) ?? 0;
      return row;
    }),
    by_weekday: Array.from({ length: 7 }, (_, d) => {
      const row: { weekday: string; [outlet: string]: number | string } = { weekday: WD[d] };
      for (const o of outletsSorted) row[o] = weekdayOutlets.get(d)?.get(o) ?? 0;
      return row;
    }),
  };

  // --- time-to-corroboration (hours until a 2nd source covered the story) ---
  const lags: number[] = [];
  for (const c of clusters) {
    const outlets = new Set(c.articles.map((a) => a.outlet));
    if (outlets.size < 2) continue;
    const sorted = [...c.articles].sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime());
    const first = new Date(sorted[0].published_at).getTime();
    const seen = new Set<string>();
    let secondAt: number | null = null;
    for (const a of sorted) {
      seen.add(a.outlet);
      if (seen.size >= 2) {
        secondAt = new Date(a.published_at).getTime();
        break;
      }
    }
    if (secondAt != null && secondAt >= first) lags.push((secondAt - first) / 3600000);
  }
  lags.sort((a, b) => a - b);
  const q = (p: number) => (lags.length ? round2(lags[Math.min(lags.length - 1, Math.floor(p * lags.length))]) : null);
  const corroboration_lag: CorroborationLag = {
    median_hours: q(0.5),
    p25_hours: q(0.25),
    p75_hours: q(0.75),
    count: lags.length,
  };

  return {
    generated_at: new Date().toISOString(),
    articles_by_day,
    outlets_by_day,
    sentiment_by_outlet,
    topics,
    authenticity,
    shifts: shifts.slice(0, 30),
    data_quality,
    corroboration_tiers,
    sentiment_histogram,
    sentiment_drift,
    posting_cadence,
    corroboration_lag,
  };
}

// Full archive as CSV (opens directly in Excel).
export function buildArchiveCsv(): string {
  const records = readRecords();
  const header = [
    'crawled_at', 'outlet', 'headline', 'url', 'published_at', 'summary', 'feed_section',
    'body_incomplete', 'analysis_provider', 'analysis_model',
    'sentiment_score', 'sentiment_label', 'bias_rating', 'bias_confidence',
    'framing', 'factual_pct', 'opinion_pct', 'tone_keywords',
  ];
  const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = records.map((r) => {
    const a = r.analysis;
    return [
      r.crawled_at, r.outlet, r.headline, r.url, r.published_at, r.summary, r.feed_section,
      r.body_incomplete, r.analysis_provider ?? (a ? 'mock' : ''), r.analysis_model ?? '',
      a ? a.sentiment.score : '', a ? a.sentiment.label : '', a ? a.bias_rating.rating : '',
      a ? a.bias_rating.confidence : '', a ? a.framing : '',
      a ? a.fact_vs_opinion.factual : '', a ? a.fact_vs_opinion.opinion : '',
      a ? a.tone_keywords.join(';') : '',
    ].map(esc).join(',');
  });
  return [header.join(','), ...rows].join('\n');
}
