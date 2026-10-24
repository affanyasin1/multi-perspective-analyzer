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
  score: number;
  label: SentimentLabel;
}

export interface Bias {
  rating: BiasRating;
  confidence: number;
}

export interface LoadedLanguage {
  quote: string;
  explanation: string;
  neutral_alternative: string;
}

export interface FactVsOpinion {
  factual: number;
  opinion: number;
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

export interface Article {
  outlet: Outlet;
  headline: string;
  url: string;
  published_at: string;
  summary: string;
  body_text: string;
  image_url: string | null;
  feed_section: Section;
  body_incomplete: boolean;
  analysis: Analysis | null;
  analysis_status: 'pending' | 'done' | 'failed';
  analysis_provider?: string;
  analysis_model?: string;
}

export interface AgreementPair {
  a: Outlet;
  b: Outlet;
  score: number;
}

export interface ComparisonSummary {
  divergence_report: string;
  spectrum_summary: string;
  agreement_matrix: AgreementPair[];
  verdict: {
    most_restrained: { outlet: Outlet; justification: string };
    most_charged: { outlet: Outlet; justification: string };
  };
}

export interface Cluster {
  id: string;
  topic_label: string;
  section: Section;
  consensus_facts: string[];
  articles: Article[];
  comparison_summary: ComparisonSummary | null;
  score: number;
  updated_at: string;
}

export interface SingleItem extends Article {
  id: string;
  countries: number;
  international: boolean;
}

export interface StoriesResponse {
  clusters: Cluster[];
  singles: SingleItem[];
  last_updated: string | null;
  stale: boolean;
  last_error: string | null;
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

export const OUTLET_SHORT: Record<Outlet, string> = {
  skynews: 'Sky',
  france24: 'F24',
  npr: 'NPR',
  indianexpress: 'IE',
  irna: 'IRNA',
  mehrnews: 'Mehr',
  thenews: 'News',
  dohanews: 'Doha',
  almonitor: 'AlMon',
  thenational: 'National',
  yonhap: 'Yonhap',
  anadolu: 'Anadolu',
  dailynewsegypt: 'DNE',
  allafrica: 'AllAfrica',
  tass: 'TASS',
  globaltimes: 'GT',
  ecns: 'ECNS',
};
