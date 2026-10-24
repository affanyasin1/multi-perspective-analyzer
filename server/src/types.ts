export type Outlet =
  | 'skynews'
  | 'france24'
  | 'npr'
  | 'indianexpress'
  | 'irna'
  | 'mehrnews'
  | 'thenews'
  | 'dohanews'
  | 'almonitor'
  | 'thenational'
  | 'yonhap'
  | 'anadolu'
  | 'dailynewsegypt'
  | 'allafrica'
  | 'tass'
  | 'globaltimes'
  | 'ecns';
export type Section = 'world' | 'politics';

export type SentimentLabel =
  | 'negative'
  | 'lean-negative'
  | 'neutral'
  | 'lean-positive'
  | 'positive';

export type BiasRating =
  | 'left'
  | 'lean-left'
  | 'center'
  | 'lean-right'
  | 'right'
  | 'not-determinable';

export interface Sentiment {
  score: number; // -1.0 .. +1.0
  label: SentimentLabel;
}

export interface Bias {
  rating: BiasRating;
  confidence: number; // 0..1
}

export interface LoadedLanguage {
  quote: string;
  explanation: string;
  neutral_alternative: string;
}

export interface FactVsOpinion {
  factual: number; // percent 0..100
  opinion: number; // percent 0..100
}

export interface Analysis {
  sentiment: Sentiment;
  bias_rating: Bias;
  framing: string;
  loaded_language: LoadedLanguage[];
  omissions: string[];
  fact_vs_opinion: FactVsOpinion;
  tone_keywords: string[];
  insufficient_evidence_flags: string[];
}

export type AnalysisStatus = 'pending' | 'done' | 'failed';

export interface Article {
  outlet: Outlet;
  headline: string;
  url: string;
  published_at: string; // ISO timestamp
  summary: string;
  body_text: string;
  image_url: string | null;
  feed_section: Section;
  body_incomplete: boolean;
  analysis: Analysis | null;
  analysis_status: AnalysisStatus;
  analysis_provider?: string; // 'mock' | 'openai' | 'kimi' | 'deepseek' | 'claude'
  analysis_model?: string; // model name ('' for mock/unanalyzed)
  source_count?: number; // distinct outlets covering this story (1 = single-source)
  verification?: Verification; // Critic's automated verification result
  verification_score?: number; // denormalized 0..1
}

export interface OutletCrawlHealth {
  outlet: string;
  feeds: number; // feeds configured for this outlet
  ok_feeds: number; // feeds that fetched successfully
  items: number; // articles ingested this crawl
  ok: boolean; // all feeds succeeded
  error: string | null; // first error, if any
  checked_at: string; // ISO timestamp of this crawl
  last_success: string | null; // last time all feeds succeeded
}

export interface Verification {
  score: number; // 0..1 fraction of fields the Critic could ground
  verified_fields: string[];
  unsupported_fields: string[];
  corrections: { field: string; reason: string; correction: string }[];
  provider: string;
  model: string;
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

export interface AgreementPair {
  a: Outlet;
  b: Outlet;
  score: number; // 0..1 pairwise framing similarity
}

export interface VerdictSide {
  outlet: Outlet;
  justification: string;
}

export interface ComparisonSummary {
  divergence_report: string;
  spectrum_summary: string;
  agreement_matrix: AgreementPair[];
  verdict: {
    most_restrained: VerdictSide;
    most_charged: VerdictSide;
  };
}

export interface ClusterAnalysis extends ComparisonSummary {
  consensus_facts: string[];
}

export interface Cluster {
  id: string;
  topic_label: string; // synthesized neutral headline
  section: Section;
  consensus_facts: string[];
  articles: Article[];
  comparison_summary: ComparisonSummary | null;
  score: number;
  updated_at: string;
}

export interface SingleItem extends Article {
  id: string;
  countries: number; // distinct country mentions
  international: boolean; // relevant beyond one country
}

export interface StoreShape {
  clusters: Cluster[];
  singles: SingleItem[];
  last_updated: string | null;
  last_error: string | null;
  stale: boolean;
  crawl_health: Record<string, OutletCrawlHealth>;
}

export const OUTLET_ORDER: Outlet[] = [
  'skynews',
  'france24',
  'npr',
  'indianexpress',
  'irna',
  'mehrnews',
  'thenews',
  'dohanews',
  'almonitor',
  'thenational',
  'yonhap',
  'anadolu',
  'dailynewsegypt',
  'allafrica',
  'tass',
  'globaltimes',
  'ecns',
];

export const OUTLET_NAMES: Record<Outlet, string> = {
  skynews: 'Sky News',
  france24: 'France 24',
  npr: 'NPR',
  indianexpress: 'Indian Express',
  irna: 'IRNA',
  mehrnews: 'Mehr News',
  thenews: 'The News',
  dohanews: 'Doha News',
  almonitor: 'Al Monitor',
  thenational: 'The National',
  yonhap: 'Yonhap News',
  anadolu: 'Anadolu Agency',
  dailynewsegypt: 'Daily News Egypt',
  allafrica: 'AllAfrica',
  tass: 'TASS',
  globaltimes: 'Global Times',
  ecns: 'ECNS',
};
