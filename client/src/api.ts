import type { Cluster, SingleItem, StoriesResponse } from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function fetchStories(params?: { section?: string; sort?: string }): Promise<StoriesResponse> {
  const qs = new URLSearchParams();
  if (params?.section) qs.set('section', params.section);
  if (params?.sort) qs.set('sort', params.sort);
  const query = qs.toString();
  return getJson<StoriesResponse>(`/api/stories${query ? `?${query}` : ''}`);
}

export function fetchStory(id: string): Promise<{ cluster: Cluster }> {
  return getJson<{ cluster: Cluster }>(`/api/story/${encodeURIComponent(id)}`);
}

export function fetchSingle(id: string): Promise<{ article: SingleItem }> {
  return getJson<{ article: SingleItem }>(`/api/single/${encodeURIComponent(id)}`);
}

export async function triggerRefresh(): Promise<void> {
  const res = await fetch('/api/refresh', { method: 'POST' });
  if (res.status !== 202 && res.status !== 409) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export interface HealthResponse {
  ok: boolean;
  clusters: number;
  stale: boolean;
  archived: number;
  archive_file: string;
  refresh_interval_min: number;
  refreshing: boolean;
  last_updated: string | null;
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health');
}

export interface OutletCrawlHealth {
  outlet: string;
  feeds: number;
  ok_feeds: number;
  items: number;
  ok: boolean;
  error: string | null;
  checked_at: string;
  last_success: string | null;
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
  by_day: { date: string; articles: number; crawled: number; avg_sentiment: number | null }[];
  top_tone_keywords: { keyword: string; count: number }[];
  crawl_health: Record<string, OutletCrawlHealth>;
}

export function fetchDashboard(): Promise<DashboardData> {
  return getJson<DashboardData>('/api/dashboard');
}

export interface OutletReliability {
  outlet: string;
  total: number;
  recent: number;
  corroborated: number;
  single_source: number;
  rate: number;
  score: number;
  label: string;
}

export function fetchReliability(): Promise<{ outlets: OutletReliability[] }> {
  return getJson<{ outlets: OutletReliability[] }>('/api/reliability');
}

export interface TopicInsight {
  topic: string;
  count: number;
  outlets: string[];
  days: number;
  latest: string;
  score: number;
}

export interface OutletAuthenticity {
  outlet: string;
  total: number;
  recent: number;
  corroborated: number;
  corroboration_rate: number;
  avg_sentiment_deviation: number | null;
  avg_bias_deviation: number | null;
  authenticity: number;
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

export function fetchInsights(): Promise<Insights> {
  return getJson<Insights>('/api/insights');
}

export interface LlmProviderOption {
  id: string;
  label: string;
  models: string[];
}

export interface LlmSettings {
  provider: string;
  model: string;
  hasKey: boolean;
  providers: LlmProviderOption[];
}

export function fetchLlmSettings(): Promise<LlmSettings> {
  return getJson<LlmSettings>('/api/llm/settings');
}

export async function saveLlmSettings(body: {
  apiKey?: string;
  model?: string;
  provider?: string;
}): Promise<{ saved: boolean; provider: string; model: string; testOk: boolean; latency_ms?: number; error?: string }> {
  const res = await fetch('/api/llm/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
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

export function fetchEval(): Promise<EvalReport> {
  return getJson<EvalReport>('/api/eval');
}

export interface BrokenImage {
  outlet: string;
  headline: string;
  url: string;
  status: number | null;
}

export interface DuplicateImage {
  url: string;
  count: number;
  articles: { outlet: string; headline: string }[];
}

export interface ImageHealth {
  checked_at: string | null;
  broken: BrokenImage[];
  duplicates: DuplicateImage[];
  resolved_total: number;
  interval_min: number;
}

export function fetchImageHealth(): Promise<ImageHealth> {
  return getJson<ImageHealth>('/api/image-health');
}

export async function triggerImageCheck(): Promise<void> {
  await fetch('/api/image-health', { method: 'POST' });
}

export interface BrokenLink {
  outlet: string;
  headline: string;
  url: string;
  status: number | null;
}

export interface LinkHealth {
  checked_at: string | null;
  broken: BrokenLink[];
  interval_min: number;
}

export function fetchLinkHealth(): Promise<LinkHealth> {
  return getJson<LinkHealth>('/api/link-health');
}

export async function triggerLinkCheck(): Promise<void> {
  await fetch('/api/link-health', { method: 'POST' });
}

export interface WorldBriefing {
  generated_at: string;
  headline: string;
  summary: string;
  divergences: string[];
  implications: string;
  provider: string;
  model: string;
}

export interface AgentActivity {
  agent: 'analyst' | 'critic' | 'reporter';
  action: string;
  at: string;
}

export interface NewsroomData {
  briefing: WorldBriefing | null;
  verification_rate: number | null;
  total_verified: number;
  interval_hours: number;
  last_generated: string | null;
  activity: AgentActivity[];
  crawling: boolean;
  briefing_running: boolean;
}

export function fetchNewsroom(): Promise<NewsroomData> {
  return getJson<NewsroomData>('/api/newsroom');
}

export async function generateBriefing(): Promise<void> {
  await fetch('/api/newsroom/briefing', { method: 'POST' });
}

export async function runNewsroom(): Promise<void> {
  await fetch('/api/newsroom/run', { method: 'POST' });
}

export interface AutoSyncState {
  autoSync: boolean;
}

export function fetchAutoSync(): Promise<AutoSyncState> {
  return getJson<AutoSyncState>('/api/autosync');
}

export async function setAutoSync(autoSync: boolean): Promise<AutoSyncState> {
  const res = await fetch('/api/autosync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ autoSync }),
  });
  return res.json();
}
