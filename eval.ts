import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import type { Cluster } from '../types';
import { loadGroundTruth, leanValue } from './groundtruth';
import { adjustedRandIndex, cohenKappa, fowlkesMallows, pearson, spearman } from './metrics';

interface EvalRecord {
  outlet: string;
  url: string;
  headline: string;
  published_at: string;
  analysis: { sentiment: { label: string; score: number }; bias_rating: { rating: string } } | null;
  verification_score?: number;
}

interface Annotation {
  url: string;
  sentiment_1: string;
  sentiment_2: string;
  bias_1: string;
  bias_2: string;
  true_topic: string;
}

function readRecords(): EvalRecord[] {
  const file = path.resolve(__dirname, '..', '..', '..', config.archiveFile);
  const out: EvalRecord[] = [];
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as EvalRecord);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

function leanOf(rating: string): number {
  switch (rating) {
    case 'left': return -1;
    case 'lean-left': return -0.5;
    case 'right': return 1;
    case 'lean-right': return 0.5;
    default: return 0;
  }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (cells[j] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function readAnnotations(): Annotation[] | null {
  const file = path.resolve(__dirname, '..', '..', '..', 'data', 'annotations.csv');
  if (!fs.existsSync(file)) return null;
  const rows = parseCsv(fs.readFileSync(file, 'utf-8'));
  return rows
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      sentiment_1: r.sentiment_1 ?? '',
      sentiment_2: r.sentiment_2 ?? '',
      bias_1: r.bias_1 ?? '',
      bias_2: r.bias_2 ?? '',
      true_topic: r.true_topic ?? '',
    }));
}

export interface EvalReport {
  generated_at: string;
  ground_truth_source: string;
  bias_correlation: { n: number; pearson_r: number | null; spearman_rho: number | null };
  outlets: { outlet: string; gt_lean: number; llm_lean: number | null; n: number }[];
  annotations: { status: 'missing' | 'insufficient' | 'ready'; file: string; count: number };
  cohen_kappa: {
    sentiment: number | null;
    bias: number | null;
    sentiment_llm_vs_gold: number | null;
    bias_llm_vs_gold: number | null;
  };
  topic: { ari: number | null; fowlkes_mallows: number | null; n: number };
  verification_rate: number | null;
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

export function buildEvalReport(clusters: Cluster[]): EvalReport {
  const records = readRecords();
  const gt = loadGroundTruth();

  // Per-outlet LLM lean from the archive.
  const llmByOutlet = new Map<string, { sum: number; n: number }>();
  for (const r of records) {
    if (!r.analysis) continue;
    const s = llmByOutlet.get(r.outlet) ?? { sum: 0, n: 0 };
    s.sum += leanOf(r.analysis.bias_rating.rating);
    s.n++;
    llmByOutlet.set(r.outlet, s);
  }

  const outlets = Object.keys(gt.outlets).filter((o) => (llmByOutlet.get(o)?.n ?? 0) > 0);
  const outletRows = outlets.map((o) => {
    const v = llmByOutlet.get(o)!;
    return {
      outlet: o,
      gt_lean: leanValue(gt, o),
      llm_lean: round2(v.sum / v.n),
      n: v.n,
    };
  });

  const gtArr = outletRows.map((r) => r.gt_lean);
  const llmArr = outletRows.map((r) => r.llm_lean as number);

  // Annotations (optional).
  const annotations = readAnnotations();
  const cohen = {
    sentiment: null as number | null,
    bias: null as number | null,
    sentiment_llm_vs_gold: null as number | null,
    bias_llm_vs_gold: null as number | null,
  };
  const topic = { ari: null as number | null, fowlkes_mallows: null as number | null, n: 0 };

  if (annotations) {
    const s1 = annotations.map((a) => a.sentiment_1).filter(Boolean);
    const s2 = annotations.map((a) => a.sentiment_2).filter(Boolean);
    if (s1.length >= 2 && s2.length === s1.length) cohen.sentiment = round2(cohenKappa(s1, s2));
    const b1 = annotations.map((a) => a.bias_1).filter(Boolean);
    const b2 = annotations.map((a) => a.bias_2).filter(Boolean);
    if (b1.length >= 2 && b2.length === b1.length) cohen.bias = round2(cohenKappa(b1, b2));

    // LLM vs gold (annotator 1).
    const byUrl = new Map(records.map((r) => [r.url, r]));
    const goldSent: string[] = [];
    const llmSent: string[] = [];
    const goldBias: string[] = [];
    const llmBias: string[] = [];
    for (const a of annotations) {
      const rec = byUrl.get(a.url);
      if (!rec?.analysis || !a.sentiment_1) continue;
      goldSent.push(a.sentiment_1);
      llmSent.push(rec.analysis.sentiment.label);
      if (a.bias_1) {
        goldBias.push(a.bias_1);
        llmBias.push(rec.analysis.bias_rating.rating);
      }
    }
    if (goldSent.length >= 2) cohen.sentiment_llm_vs_gold = round2(cohenKappa(goldSent, llmSent));
    if (goldBias.length >= 2) cohen.bias_llm_vs_gold = round2(cohenKappa(goldBias, llmBias));

    // Topic clustering: true_topic vs system cluster id.
    const urlToCluster = new Map<string, string>();
    for (const c of clusters) for (const a of c.articles) urlToCluster.set(a.url, c.id);
    const trueTopic: string[] = [];
    const predTopic: string[] = [];
    for (const a of annotations) {
      const cid = urlToCluster.get(a.url);
      if (!cid || !a.true_topic) continue;
      trueTopic.push(a.true_topic);
      predTopic.push(cid);
    }
    if (trueTopic.length >= 2) {
      topic.n = trueTopic.length;
      topic.ari = round2(adjustedRandIndex(trueTopic, predTopic));
      topic.fowlkes_mallows = round2(fowlkesMallows(trueTopic, predTopic));
    }
  }

  // Mean Critic verification score over archived articles.
  let verSum = 0;
  let verN = 0;
  for (const r of records) {
    if (r.verification_score != null) {
      verSum += r.verification_score;
      verN++;
    }
  }
  const verification_rate = verN ? round2(verSum / verN) : null;

  return {
    generated_at: new Date().toISOString(),
    ground_truth_source: gt.source,
    bias_correlation: {
      n: outletRows.length,
      pearson_r: round2(pearson(gtArr, llmArr)),
      spearman_rho: round2(spearman(gtArr, llmArr)),
    },
    outlets: outletRows,
    annotations: {
      status: !annotations ? 'missing' : annotations.length < 2 ? 'insufficient' : 'ready',
      file: 'data/annotations.csv',
      count: annotations?.length ?? 0,
    },
    cohen_kappa: cohen,
    topic,
    verification_rate,
  };
}

const CSV_COLUMNS = ['url', 'outlet', 'headline', 'published_at', 'sentiment_1', 'sentiment_2', 'bias_1', 'bias_2', 'true_topic'];

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Generate a template CSV of analyzed articles, stratified by outlet, with
// empty annotation columns for two annotators + a true-topic label.
export function sampleAnnotationsCsv(limit = 100): string {
  const records = readRecords().filter((r) => r.analysis);
  const byOutlet = new Map<string, EvalRecord[]>();
  for (const r of records) {
    const arr = byOutlet.get(r.outlet) ?? [];
    arr.push(r);
    byOutlet.set(r.outlet, arr);
  }
  const picked: EvalRecord[] = [];
  let guard = 0;
  while (picked.length < limit && guard < limit * 2) {
    guard++;
    for (const arr of byOutlet.values()) {
      const next = arr.shift();
      if (next) picked.push(next);
      if (picked.length >= limit) break;
    }
    if ([...byOutlet.values()].every((a) => a.length === 0)) break;
  }

  const rows = picked.map((r) =>
    CSV_COLUMNS.map((c) => {
      if (c === 'url') return csvEscape(r.url);
      if (c === 'outlet') return r.outlet;
      if (c === 'headline') return csvEscape(r.headline);
      if (c === 'published_at') return r.published_at;
      return '';
    }).join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}
