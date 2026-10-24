import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import type { Outlet, Section } from './types';

export interface FeedDefinition {
  outlet: Outlet;
  kind: 'rss' | 'guardian';
  url: string;
  section: Section;
}

export const FEEDS: FeedDefinition[] = [
  { outlet: 'skynews', kind: 'rss', url: 'https://feeds.skynews.com/feeds/rss/world.xml', section: 'world' },
  { outlet: 'skynews', kind: 'rss', url: 'https://feeds.skynews.com/feeds/rss/politics.xml', section: 'politics' },
  { outlet: 'france24', kind: 'rss', url: 'https://www.france24.com/en/rss', section: 'world' },
  { outlet: 'npr', kind: 'rss', url: 'https://feeds.npr.org/1004/rss.xml', section: 'world' },
  { outlet: 'npr', kind: 'rss', url: 'https://feeds.npr.org/1014/rss.xml', section: 'politics' },
  { outlet: 'indianexpress', kind: 'rss', url: 'https://indianexpress.com/feed/', section: 'world' },
  { outlet: 'irna', kind: 'rss', url: 'https://en.irna.ir/rss', section: 'world' },
  { outlet: 'mehrnews', kind: 'rss', url: 'https://en.mehrnews.com/rss', section: 'world' },
  { outlet: 'thenews', kind: 'rss', url: 'https://www.thenews.com.pk/rss/1/1', section: 'world' },
  { outlet: 'dohanews', kind: 'rss', url: 'https://dohanews.co/feed/', section: 'world' },
  { outlet: 'almonitor', kind: 'rss', url: 'https://www.al-monitor.com/rss', section: 'world' },
  { outlet: 'thenational', kind: 'rss', url: 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml', section: 'world' },
  { outlet: 'yonhap', kind: 'rss', url: 'https://en.yna.co.kr/RSS/news.xml', section: 'world' },
  { outlet: 'anadolu', kind: 'rss', url: 'https://www.aa.com.tr/en/rss/default?cat=world', section: 'world' },
  { outlet: 'dailynewsegypt', kind: 'rss', url: 'https://www.dailynewsegypt.com/feed/', section: 'world' },
  { outlet: 'allafrica', kind: 'rss', url: 'https://allafrica.com/tools/headlines/rdf/africa/headlines.rdf', section: 'world' },
  { outlet: 'tass', kind: 'rss', url: 'https://tass.com/rss/v2.xml', section: 'world' },
  { outlet: 'globaltimes', kind: 'rss', url: 'https://www.globaltimes.cn/rss/outbrain.xml', section: 'world' },
  { outlet: 'ecns', kind: 'rss', url: 'http://www.ecns.cn/rss/rss.xml', section: 'world' },
];

export const config = {
  port: Number(process.env.PORT ?? 4000),
  refreshIntervalMin: Number(process.env.REFRESH_INTERVAL_MIN ?? 60),
  healthCheckIntervalMin: Number(process.env.HEALTH_CHECK_INTERVAL_MIN ?? 30),
  briefingIntervalHours: Number(process.env.BRIEFING_INTERVAL_HOURS ?? 5),
  autoSync: process.env.AUTO_SYNC !== 'false',
  minFeedIntervalMin: 15,
  // Max multi-source clusters stored & served. The Home page shows the first
  // 12 and a "View more" button expands up to this cap. Raising this also
  // increases per-crawl analysis work (LLM cost/time with a real key).
  topN: 36,
  singlesLimit: 40,
  dataFile: process.env.DATA_FILE ?? 'data/store.json',
  archiveFile: process.env.ARCHIVE_FILE ?? 'data/archive.jsonl',

  llm: {
    provider: process.env.LLM_PROVIDER ?? 'openai',
    baseUrl: process.env.LLM_BASE_URL ?? '',
    apiKey: sanitizeApiKey(process.env.LLM_API_KEY ?? ''),
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
  },

  // Clustering thresholds (tuneable)
  cluster: {
    minOutlets: 2,
    similarityThreshold: 0.25,
    jaccardThreshold: 0.55,
    sameOutletSimilarity: 0.45,
    sameOutletJaccard: 0.7,
    maxDaySpan: 4,
  },
};

export type LlmProviderId = 'openai' | 'kimi' | 'deepseek' | 'claude';

export interface LlmProviderInfo {
  id: LlmProviderId;
  label: string;
  baseUrl: string;
  apiKind: 'openai' | 'anthropic';
  models: string[];
}

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  { id: 'openai', label: 'OpenAI (GPT)', baseUrl: 'https://api.openai.com/v1', apiKind: 'openai', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] },
  { id: 'kimi', label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', apiKind: 'openai', models: ['kimi-k2-turbo-preview', 'moonshot-v1-32k', 'moonshot-v1-8k', 'moonshot-v1-128k'] },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKind: 'openai', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'claude', label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com/v1', apiKind: 'anthropic', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'] },
];

export function getLlmProvider(): LlmProviderInfo {
  const id = (config.llm.provider as LlmProviderId) || 'openai';
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0];
}

export function getLlmBaseUrl(): string {
  return config.llm.baseUrl || getLlmProvider().baseUrl;
}

// Which provider/model produced the analysis (or 'mock' when no key is set).
export function currentLlmMode(): { provider: string; model: string } {
  if (!config.llm.apiKey) return { provider: 'mock', model: '' };
  return { provider: config.llm.provider, model: config.llm.model };
}

// Strip non-ASCII/formatting characters (em dashes, NBSP, etc.) that can be
// introduced by copy-paste and break HTTP headers.
export function sanitizeApiKey(key: string): string {
  return key.replace(/[^\x20-\x7E]/g, '').trim();
}

const ENV_PATH = path.resolve(__dirname, '..', '.env');

function readEnvFile(): string {
  try {
    return fs.readFileSync(ENV_PATH, 'utf-8');
  } catch {
    return '';
  }
}

function setEnvVar(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  let found = false;
  const out = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) out.push(`${key}=${value}`);
  return out.join('\n');
}

// Persist the current LLM settings to server/.env (loaded on next restart).
export function persistLlmSettings(): void {
  let content = readEnvFile();
  content = setEnvVar(content, 'LLM_PROVIDER', config.llm.provider);
  content = setEnvVar(content, 'LLM_API_KEY', config.llm.apiKey);
  content = setEnvVar(content, 'LLM_MODEL', config.llm.model);
  content = setEnvVar(content, 'LLM_BASE_URL', config.llm.baseUrl);
  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}

// Persist the auto-sync on/off flag to server/.env.
export function persistAutoSync(value: boolean): void {
  let content = readEnvFile();
  content = setEnvVar(content, 'AUTO_SYNC', String(value));
  fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
  fs.writeFileSync(ENV_PATH, content, 'utf-8');
}
