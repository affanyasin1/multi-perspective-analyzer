import fs from 'node:fs';
import path from 'node:path';
import type { Analysis, Article, Verification } from './types';

export interface ArchivedArticle {
  crawled_at: string;
  outlet: string;
  headline: string;
  url: string;
  published_at: string;
  summary: string;
  body_text: string;
  image_url: string | null;
  feed_section: string;
  body_incomplete: boolean;
  analysis: Analysis | null;
  analysis_provider: string;
  analysis_model: string;
  analysis_status: string;
  source_count: number;
  verification: Verification | null;
  verification_score: number | null;
}

/**
 * Append-only, deduped archive of every article seen across crawls.
 * One JSON object per line (JSONL), deduped by URL so re-crawling the same
 * article does not duplicate it. Grows into a local dataset for later analysis.
 */
export class Archive {
  private file: string;
  private seen: Set<string>;
  private count: number;

  constructor(file: string) {
    this.file = path.resolve(__dirname, '..', '..', file);
    this.seen = new Set();
    this.count = 0;
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.file)) {
      const content = fs.readFileSync(this.file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const rec = JSON.parse(trimmed) as { url?: string };
          if (rec.url) this.seen.add(rec.url);
          this.count++;
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  get size(): number {
    return this.count;
  }

  append(articles: Article[], crawledAt: string): number {
    let added = 0;
    for (const a of articles) {
      if (!a.url || this.seen.has(a.url)) continue;
      this.seen.add(a.url);
      const record: ArchivedArticle = {
        crawled_at: crawledAt,
        outlet: a.outlet,
        headline: a.headline,
        url: a.url,
        published_at: a.published_at,
        summary: a.summary,
        body_text: a.body_text,
        image_url: a.image_url,
        feed_section: a.feed_section,
        body_incomplete: a.body_incomplete,
        analysis: a.analysis,
        analysis_provider: a.analysis_provider ?? (a.analysis ? 'mock' : ''),
        analysis_model: a.analysis_model ?? '',
        analysis_status: a.analysis_status,
        source_count: a.source_count ?? 1,
        verification: a.verification ?? null,
        verification_score: a.verification_score ?? null,
      };
      fs.appendFileSync(this.file, JSON.stringify(record) + '\n', 'utf-8');
      added++;
      this.count++;
    }
    return added;
  }
}
