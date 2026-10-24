import type { Analysis, Article, ClusterAnalysis, Outlet, SentimentLabel } from '../types';
import { OUTLET_ORDER } from '../types';
import { config, getLlmBaseUrl, getLlmProvider } from '../config';
import { articlePrompt, clusterPrompt, parseJson, sanitizeAnalysis, sanitizeSummary } from './prompts';

export interface AnalysisProvider {
  name: string;
  analyzeArticle(article: Article): Promise<Analysis>;
  summarizeCluster(cluster: { articles: Article[] }): Promise<ClusterAnalysis>;
  complete(system: string, user: string): Promise<string>;
}

export class OpenAIProvider implements AnalysisProvider {
  name = 'openai';
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  async complete(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(this.baseUrl.includes('openai.com') ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      // Do not expose upstream response bodies, which can contain credentials.
      await res.body?.cancel();
      throw new Error(`LLM HTTP ${res.status}: request failed`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return content;
  }

  async analyzeArticle(article: Article): Promise<Analysis> {
    const { system, user } = articlePrompt(article);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = await this.complete(system, user);
        return sanitizeAnalysis(parseJson<unknown>(content));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async summarizeCluster(cluster: { articles: Article[] }): Promise<ClusterAnalysis> {
    const { system, user } = clusterPrompt(cluster);
    const content = await this.complete(system, user);
    const outlets = cluster.articles.map((a) => a.outlet);
    return sanitizeSummary(parseJson<unknown>(content), outlets);
  }
}

export class AnthropicProvider implements AnalysisProvider {
  name = 'anthropic';
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
  ) {}

  async complete(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: `${system}\n\n${user}` }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      // Do not expose upstream response bodies, which can contain credentials.
      await res.body?.cancel();
      throw new Error(`LLM HTTP ${res.status}: request failed`);
    }
    const json = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    if (!text) throw new Error('LLM returned empty content');
    return text;
  }

  async analyzeArticle(article: Article): Promise<Analysis> {
    const { system, user } = articlePrompt(article);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = await this.complete(system, user);
        return sanitizeAnalysis(parseJson<unknown>(content));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async summarizeCluster(cluster: { articles: Article[] }): Promise<ClusterAnalysis> {
    const { system, user } = clusterPrompt(cluster);
    const content = await this.complete(system, user);
    const outlets = cluster.articles.map((a) => a.outlet);
    return sanitizeSummary(parseJson<unknown>(content), outlets);
  }
}

// ---------------------------------------------------------------------------
// Mock provider: deterministic, evidence-quoted, zero-config. Produces
// realistic per-article analysis so the app is fully demoable with no API key.
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OUTLET_BIAS_PRIOR: Record<Outlet, number> = {
  france24: -0.05,
  skynews: 0.02,
  npr: -0.15,
  indianexpress: 0.02,
  irna: -0.1,
  mehrnews: -0.05,
  thenews: 0.02,
  dohanews: -0.05,
  almonitor: -0.05,
  thenational: 0.05,
  yonhap: 0,
  anadolu: 0.05,
  dailynewsegypt: 0,
  allafrica: 0,
  tass: 0.15,
  globaltimes: 0.15,
  ecns: 0.1,
};

const OUTLET_SENTIMENT_PRIOR: Record<Outlet, number> = {
  france24: 0,
  skynews: 0,
  npr: 0,
  indianexpress: 0,
  irna: 0,
  mehrnews: 0,
  thenews: 0,
  dohanews: 0,
  almonitor: 0,
  thenational: 0,
  yonhap: 0,
  anadolu: 0,
  dailynewsegypt: 0,
  allafrica: 0,
  tass: 0,
  globaltimes: 0,
  ecns: 0,
};

const TONE_POOL = [
  'measured', 'urgent', 'somber', 'critical', 'analytical', 'concerned', 'defiant', 'hopeful',
  'skeptical', 'restrained', 'alarmist', 'celebratory', 'cautious', 'forceful', 'clinical',
];

const FRAMING_TEMPLATES = [
  'Focuses on the immediate human impact and eyewitness accounts.',
  'Leads with the institutional response and official statements.',
  'Emphasizes the political stakes and what happens next.',
  'Frames the event through economic consequences and market reaction.',
  'Foregrounds conflict and the parties in dispute.',
  'Takes a data-driven angle, stressing verified figures and timelines.',
  'Centers the story on a single symbolic individual.',
  'Contextualizes the event inside a longer historical arc.',
];

const OMISSION_TEMPLATES = [
  'The precise casualty figures reported elsewhere.',
  'A named official source cited by other outlets.',
  'The timing of the events as corroborated by witnesses.',
  'The international community\u2019s stated response.',
  'Background on the parties\u2019 prior history.',
  'The financial scale of the deal or loss.',
];

function sentenceUnits(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 240);
}

function pickQuote(rand: () => number, text: string): string {
  const units = sentenceUnits(text);
  if (units.length === 0) {
    const words = text.split(/\s+/);
    if (words.length < 6) return text.slice(0, 120);
    const start = Math.floor(rand() * Math.max(1, words.length - 6));
    return words.slice(start, start + 8).join(' ');
  }
  return units[Math.floor(rand() * units.length)];
}

function biasRatingFromLean(lean: number): { rating: Analysis['bias_rating']['rating']; confidence: number } {
  if (lean < -0.5) return { rating: 'left', confidence: 0.6 + Math.abs(lean) * 0.3 };
  if (lean < -0.15) return { rating: 'lean-left', confidence: 0.55 + Math.abs(lean) * 0.3 };
  if (lean > 0.5) return { rating: 'right', confidence: 0.6 + Math.abs(lean) * 0.3 };
  if (lean > 0.15) return { rating: 'lean-right', confidence: 0.55 + Math.abs(lean) * 0.3 };
  return { rating: 'center', confidence: 0.5 + Math.abs(lean) * 0.2 };
}

function sentimentLabelFromScore(score: number): SentimentLabel {
  if (score <= -0.6) return 'negative';
  if (score <= -0.2) return 'lean-negative';
  if (score < 0.2) return 'neutral';
  if (score < 0.6) return 'lean-positive';
  return 'positive';
}

export class MockProvider implements AnalysisProvider {
  name = 'mock';

  async complete(_system: string, _user: string): Promise<string> {
    throw new Error('mock provider has no raw complete');
  }

  async analyzeArticle(article: Article): Promise<Analysis> {
    const rand = mulberry32(hashString(article.url));
    const text = article.body_text && article.body_text.length > 40 ? article.body_text : article.summary || article.headline;

    const sentimentScore = clamp(
      OUTLET_SENTIMENT_PRIOR[article.outlet] + (rand() * 2 - 1) * 0.55,
      -1,
      1,
    );

    const lean = clamp(OUTLET_BIAS_PRIOR[article.outlet] + (rand() - 0.5) * 0.4, -1, 1);
    const { rating, confidence } = biasRatingFromLean(lean);

    const nQuotes = 1 + Math.floor(rand() * 3);
    const toneKeywords = [...TONE_POOL].sort(() => rand() - 0.5).slice(0, 5);
    const framing = FRAMING_TEMPLATES[Math.floor(rand() * FRAMING_TEMPLATES.length)];

    const loaded_language: Analysis['loaded_language'] = [];
    const seenQuotes = new Set<string>();
    for (let i = 0; i < nQuotes && i < 5; i++) {
      const quote = pickQuote(rand, text);
      if (seenQuotes.has(quote)) continue;
      seenQuotes.add(quote);
      loaded_language.push({
        quote,
        explanation: 'Emotionally charged wording that steers the reader\u2019s interpretation.',
        neutral_alternative: 'A neutral phrasing that states the same underlying fact without the charge.',
      });
    }

    const omissions: string[] = [];
    const nOmissions = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < nOmissions; i++) {
      const pick = OMISSION_TEMPLATES[Math.floor(rand() * OMISSION_TEMPLATES.length)];
      if (!omissions.includes(pick)) omissions.push(pick);
    }

    const factual = Math.round(55 + rand() * 35);

    return {
      sentiment: { score: round1(sentimentScore), label: sentimentLabelFromScore(sentimentScore) },
      bias_rating: { rating, confidence: round2(confidence) },
      framing,
      loaded_language,
      omissions,
      fact_vs_opinion: { factual, opinion: 100 - factual },
      tone_keywords: toneKeywords,
      insufficient_evidence_flags: [],
    };
  }

  async summarizeCluster(cluster: { articles: Article[] }): Promise<ClusterAnalysis> {
    const outlets = cluster.articles.filter((a) => a.analysis).map((a) => a.outlet);
    const byOutlet = new Map<Outlet, Analysis>();
    for (const a of cluster.articles) if (a.analysis) byOutlet.set(a.outlet, a.analysis);

    const rand = mulberry32(hashString(cluster.articles.map((a) => a.url).join('|')));
    const ordered = OUTLET_ORDER.filter((o) => byOutlet.has(o));
    const topic = cluster.articles[0]?.headline ?? 'the story';

    const consensus_facts = [
      'The event occurred and was reported by all outlets on the same day.',
      'The core parties involved are named consistently across coverage.',
      'Initial figures and timelines are broadly consistent between outlets.',
    ];

    const agreement_matrix = ordered.flatMap((a, i) =>
      ordered.slice(i + 1).map((b) => ({
        a,
        b,
        score: round2(0.55 + Math.min(0.4, Math.abs((byOutlet.get(a)!.sentiment.score) - (byOutlet.get(b)!.sentiment.score)) * 0.4 + rand() * 0.1)),
      })),
    );

    const sortedBySentiment = [...ordered].sort(
      (a, b) => Math.abs(byOutlet.get(a)!.sentiment.score) - Math.abs(byOutlet.get(b)!.sentiment.score),
    );
    const most_restrained = sortedBySentiment[0] ?? ordered[0];
    const most_charged = sortedBySentiment[sortedBySentiment.length - 1] ?? ordered[ordered.length - 1];

    return {
      consensus_facts,
      divergence_report: `The outlets agree on the basic facts of "${topic}" but diverge in emphasis: some lead with the human impact, others with the political or institutional response. Wording ranges from restrained, matter-of-fact reporting to more loaded, interpretive language.`,
      spectrum_summary: `The most restrained telling sticks to verified facts and neutral attribution. Toward the middle, outlets add context and analysis. The most charged telling uses more emotive language and leads with conflict or consequence.`,
      agreement_matrix,
      verdict: {
        most_restrained: {
          outlet: most_restrained,
          justification: 'Uses the most neutral wording and the fewest loaded phrases.',
        },
        most_charged: {
          outlet: most_charged,
          justification: 'Uses the most emotionally charged language and leads with the sharpest framing.',
        },
      },
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function createProvider(): AnalysisProvider {
  if (!config.llm.apiKey) return new MockProvider();
  const provider = getLlmProvider();
  if (provider.apiKind === 'anthropic') {
    return new AnthropicProvider(getLlmBaseUrl(), config.llm.apiKey, config.llm.model);
  }
  return new OpenAIProvider(getLlmBaseUrl(), config.llm.apiKey, config.llm.model);
}
