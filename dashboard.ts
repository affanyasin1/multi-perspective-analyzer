import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { Analysis, OutletCrawlHealth } from './types';

interface ArchivedRecord {
  crawled_at: string;
  outlet: string;
  published_at: string;
  feed_section: string;
  analysis: Analysis | null;
}

export interface DayBucket {
  date: string;
  articles: number;
  crawled: number;
  avg_sentiment: number | null;
}

export interface DashboardData {
  generated_at: string;
  total_articles: number;
  analyzed_articles: number;
  clusters: number;
  outlets: Record<string, number>;
  sections: Record<string, number>;
  sentiment_labels: Record<string, number>;
  bias_labels: Record<string, number>;
  sentiment_by_outlet: { outlet: string; avg: number; count: number }[];
  bias_by_outlet: Record<string, Record<string, number>>;
  by_day: DayBucket[];
  top_tone_keywords: { keyword: string; count: number }[];
  crawl_health: Record<string, OutletCrawlHealth>;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildDashboard(clusterCount: number, crawlHealth: Record<string, OutletCrawlHealth>): DashboardData {
  const file = path.resolve(__dirname, '..', '..', config.archiveFile);
  const records: ArchivedRecord[] = [];
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        records.push(JSON.parse(t) as ArchivedRecord);
      } catch {
        // skip malformed lines
      }
    }
  }

  const outlets: Record<string, number> = {};
  const sections: Record<string, number> = {};
  const sentimentLabels: Record<string, number> = {};
  const biasLabels: Record<string, number> = {};
  const biasByOutlet: Record<string, Record<string, number>> = {};
  const toneCounts: Record<string, number> = {};
  const sentimentByOutlet: Record<string, { sum: number; count: number }> = {};
  const dayArticles = new Map<string, number>();
  const dayCrawled = new Map<string, number>();
  const daySentSum = new Map<string, number>();
  const daySentCount = new Map<string, number>();

  let analyzed = 0;
  for (const r of records) {
    outlets[r.outlet] = (outlets[r.outlet] ?? 0) + 1;
    sections[r.feed_section] = (sections[r.feed_section] ?? 0) + 1;

    const pd = dayKey(r.published_at);
    if (pd) dayArticles.set(pd, (dayArticles.get(pd) ?? 0) + 1);
    const cd = dayKey(r.crawled_at);
    if (cd) dayCrawled.set(cd, (dayCrawled.get(cd) ?? 0) + 1);

    if (r.analysis) {
      analyzed++;
      const sl = r.analysis.sentiment.label;
      sentimentLabels[sl] = (sentimentLabels[sl] ?? 0) + 1;
      const br = r.analysis.bias_rating.rating;
      biasLabels[br] = (biasLabels[br] ?? 0) + 1;
      biasByOutlet[r.outlet] ??= {};
      biasByOutlet[r.outlet][br] = (biasByOutlet[r.outlet][br] ?? 0) + 1;
      const se = (sentimentByOutlet[r.outlet] ??= { sum: 0, count: 0 });
      se.sum += r.analysis.sentiment.score;
      se.count++;
      for (const k of r.analysis.tone_keywords) toneCounts[k] = (toneCounts[k] ?? 0) + 1;
      if (pd) {
        daySentSum.set(pd, (daySentSum.get(pd) ?? 0) + r.analysis.sentiment.score);
        daySentCount.set(pd, (daySentCount.get(pd) ?? 0) + 1);
      }
    }
  }

  const allDays = new Set([...dayArticles.keys(), ...dayCrawled.keys(), ...daySentSum.keys()]);
  const by_day: DayBucket[] = [...allDays].sort().map((date) => ({
    date,
    articles: dayArticles.get(date) ?? 0,
    crawled: dayCrawled.get(date) ?? 0,
    avg_sentiment:
      (daySentCount.get(date) ?? 0) > 0
        ? round2((daySentSum.get(date) ?? 0) / (daySentCount.get(date) as number))
        : null,
  }));

  return {
    generated_at: new Date().toISOString(),
    total_articles: records.length,
    analyzed_articles: analyzed,
    clusters: clusterCount,
    outlets,
    sections,
    sentiment_labels: sentimentLabels,
    bias_labels: biasLabels,
    sentiment_by_outlet: Object.entries(sentimentByOutlet).map(([outlet, v]) => ({
      outlet,
      avg: round2(v.sum / v.count),
      count: v.count,
    })),
    bias_by_outlet: biasByOutlet,
    by_day,
    top_tone_keywords: Object.entries(toneCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([keyword, count]) => ({ keyword, count })),
    crawl_health: crawlHealth,
  };
}

export interface OutletReliability {
  outlet: string;
  total: number;
  recent: number; // articles in the last 14 days
  corroborated: number; // raw count of corroborated articles (all time)
  single_source: number;
  rate: number; // recency-weighted corroboration rate 0..1
  score: number; // 0..100
  label: string;
}

// Recency-weighted corroboration: how often an outlet's recent reporting was
// independently covered by another outlet (i.e. had analysis as part of a 2+
// outlet cluster). Newer articles count more (7-day half-life). Not a
// truthfulness verdict — a proxy for how consistently others verify its coverage.
export function buildReliability(): OutletReliability[] {
  const file = path.resolve(__dirname, '..', '..', config.archiveFile);
  const now = Date.now();
  const stats = new Map<string, { weight: number; corr: number; total: number; recent: number; rawCorr: number }>();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t) as { outlet?: string; analysis?: unknown; published_at?: string };
        if (!r.outlet) continue;
        const ageDays = r.published_at ? (now - new Date(r.published_at).getTime()) / 86400000 : 999;
        const w = ageDays < 0 ? 1 : Math.pow(0.5, ageDays / 7);
        const s = stats.get(r.outlet) ?? { weight: 0, corr: 0, total: 0, recent: 0, rawCorr: 0 };
        s.total++;
        s.weight += w;
        if (ageDays <= 14) s.recent++;
        if (r.analysis) {
          s.corr += w;
          s.rawCorr++;
        }
        stats.set(r.outlet, s);
      } catch {
        // skip malformed lines
      }
    }
  }

  return [...stats.entries()]
    .map(([outlet, s]) => {
      const rate = s.weight > 0 ? s.corr / s.weight : 0;
      const score = Math.round(rate * 100);
      const label = s.recent < 3 ? 'Insufficient data' : score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low';
      return {
        outlet,
        total: s.total,
        recent: s.recent,
        corroborated: s.rawCorr,
        single_source: s.total - s.rawCorr,
        rate: round2(rate),
        score,
        label,
      };
    })
    .sort((a, b) => b.score - a.score);
}
