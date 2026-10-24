import fs from 'node:fs';
import path from 'node:path';
import type { Cluster, OutletCrawlHealth, SingleItem, StoreShape } from './types';
import { config } from './config';

const EMPTY: StoreShape = {
  clusters: [],
  singles: [],
  last_updated: null,
  last_error: null,
  stale: false,
  crawl_health: {},
};

function filePath(): string {
  return path.resolve(__dirname, '..', '..', config.dataFile);
}

export class Store {
  private data: StoreShape;
  private path: string;
  private mtime: number;

  constructor() {
    this.path = filePath();
    this.mtime = this.fileMtime();
    this.data = this.load();
  }

  private fileMtime(): number {
    try {
      return fs.statSync(this.path).mtimeMs;
    } catch {
      return 0;
    }
  }

  private load(): StoreShape {
    try {
      const raw = fs.readFileSync(this.path, 'utf-8');
      const parsed = JSON.parse(raw) as StoreShape;
      return {
        clusters: Array.isArray(parsed.clusters) ? parsed.clusters : [],
        singles: Array.isArray(parsed.singles) ? parsed.singles : [],
        last_updated: parsed.last_updated ?? null,
        last_error: parsed.last_error ?? null,
        stale: parsed.stale ?? false,
        crawl_health: parsed.crawl_health ?? {},
      };
    } catch {
      return { ...EMPTY };
    }
  }

  // Reload from disk if another process (e.g. the scheduled crawl) rewrote it.
  reloadIfChanged(): boolean {
    const m = this.fileMtime();
    if (m === this.mtime) return false;
    this.mtime = m;
    this.data = this.load();
    return true;
  }

  get clusters(): Cluster[] {
    return this.data.clusters;
  }

  get singles(): SingleItem[] {
    return this.data.singles;
  }

  get lastUpdated(): string | null {
    return this.data.last_updated;
  }

  get stale(): boolean {
    return this.data.stale;
  }

  get lastError(): string | null {
    return this.data.last_error;
  }

  get crawlHealth(): Record<string, OutletCrawlHealth> {
    return this.data.crawl_health;
  }

  save(
    clusters: Cluster[],
    singles: SingleItem[],
    opts: {
      lastUpdated?: string;
      lastError?: string | null;
      stale?: boolean;
      crawlHealth?: Record<string, OutletCrawlHealth>;
    } = {},
  ): void {
    this.data = {
      clusters,
      singles,
      last_updated: opts.lastUpdated ?? this.data.last_updated ?? null,
      last_error: opts.lastError !== undefined ? opts.lastError : this.data.last_error,
      stale: opts.stale ?? false,
      crawl_health: opts.crawlHealth ?? this.data.crawl_health ?? {},
    };
    const dir = path.dirname(this.path);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.path}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tmp, this.path);
    this.mtime = this.fileMtime();
  }

  markStale(stale: boolean, error?: string | null): void {
    this.data.stale = stale;
    if (error !== undefined) this.data.last_error = error;
    const dir = path.dirname(this.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
    this.mtime = this.fileMtime();
  }
}
