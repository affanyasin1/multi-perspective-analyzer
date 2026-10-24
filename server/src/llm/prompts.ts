import type { Analysis, Article, ClusterAnalysis, Outlet } from '../types';
import { OUTLET_ORDER } from '../types';

const ARTICLE_SYSTEM = `You are a careful, evidence-based media analyst. You analyze a single news article as part of a cluster of articles from other outlets covering the SAME event.

Hard rules:
- Every analytic claim (bias, framing, loaded language, omission) MUST be supported by a verbatim quote from the article's own words. If you cannot find a verbatim quote to support a claim, set insufficient_evidence_flags to include that field's name and leave the claim empty/minimal. Never guess or invent a quote.
- Describe bias as LEAN relative to the other outlets in this cluster, not absolute truth. Outlets with neutral, matter-of-fact reporting are stylistic baselines.
- Never assert an outlet "lied". Assert what words were chosen and what was omitted.
- Output ONLY valid JSON matching the requested schema. No commentary outside the JSON.`;

const CLUSTER_SYSTEM = `You are a careful, evidence-based media analyst comparing multiple outlets' coverage of the SAME event. You receive each outlet's analysis (already evidence-quoted). Produce a fair cross-outlet comparison. Bias is described relative to the cluster, never as absolute truth. Output ONLY valid JSON matching the requested schema.`;

function truncate(text: string, maxChars = 30000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '…';
}

export function articlePrompt(article: Article): { system: string; user: string } {
  const body = article.body_text && article.body_text.length > 40 ? article.body_text : article.summary;
  const user = `Outlet: ${article.outlet}
Headline: ${article.headline}
Summary: ${article.summary}
${article.body_incomplete ? '(Note: full body unavailable/paywalled — analyze from the summary only.)\n' : ''}
Article text (may be truncated):
${truncate(body)}

Return JSON with EXACTLY this schema:
{
  "sentiment": { "score": <number -1.0..1.0>, "label": <"negative"|"lean-negative"|"neutral"|"lean-positive"|"positive"> },
  "bias_rating": { "rating": <"left"|"lean-left"|"center"|"lean-right"|"right"|"not-determinable">, "confidence": <number 0..1> },
  "framing": <one sentence: what angle does this article take?>,
  "loaded_language": [ { "quote": <verbatim phrase from the article>, "explanation": <why it is emotionally charged/vague/editorializing>, "neutral_alternative": <neutral rewording> } ],
  "omissions": [ <facts/details present in other coverage of this event but missing here> ],
  "fact_vs_opinion": { "factual": <number 0..100>, "opinion": <number 0..100> },
  "tone_keywords": [ <5 adjectives describing tone> ],
  "insufficient_evidence_flags": [ <field names lacking verbatim support> ]
}
loaded_language must have at most 5 entries. Every loaded_language.quote must appear verbatim in the article text.`;
  return { system: ARTICLE_SYSTEM, user };
}

export function clusterPrompt(cluster: { articles: Article[] }): { system: string; user: string } {
  const summaries = cluster.articles
    .filter((a) => a.analysis)
    .map((a) => ({
      outlet: a.outlet,
      headline: a.headline,
      sentiment: a.analysis?.sentiment,
      bias_rating: a.analysis?.bias_rating,
      framing: a.analysis?.framing,
      tone_keywords: a.analysis?.tone_keywords,
      loaded_language: a.analysis?.loaded_language,
      omissions: a.analysis?.omissions,
    }));

  const user = `Here are the per-outlet analyses for one story cluster:
${JSON.stringify(summaries, null, 2)}

Return JSON with EXACTLY this schema:
{
  "consensus_facts": [ <facts every outlet agrees on — the ground-truth core> ],
  "divergence_report": <2-4 sentences on where the tellings differ: emphasis, wording, what each led with, what each omitted>,
  "spectrum_summary": <3 sentences tracing the story from the most restrained telling to the most charged telling>,
  "agreement_matrix": [ { "a": <outlet>, "b": <outlet>, "score": <0..1 pairwise framing similarity> } ],
  "verdict": {
    "most_restrained": { "outlet": <outlet>, "justification": <one sentence> },
    "most_charged": { "outlet": <outlet>, "justification": <one sentence> }
  }
}
Include one agreement_matrix pair for every ordered pair of distinct outlets. Outlet values must be one of: ${OUTLET_ORDER.join(', ')}.`;
  return { system: CLUSTER_SYSTEM, user };
}

function stripFences(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return t.trim();
}

// Remove // and /* */ comments while respecting string literals.
function stripComments(text: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] ?? '';
        i++;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

// Extract the first balanced {...} block (string-aware), dropping any prose
// the model emitted before or after the JSON.
function extractObject(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return text;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

// Remove trailing commas before } or ] — a very common LLM mistake.
function removeTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

export function parseJson<T>(text: string): T {
  const cleaned = removeTrailingCommas(extractObject(stripComments(stripFences(text))));
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`LLM returned unparseable JSON: ${(err as Error).message}`);
  }
}

const VALID_OUTLETS: Outlet[] = [...OUTLET_ORDER];

export function sanitizeAnalysis(raw: unknown): Analysis {
  const a = (raw ?? {}) as Record<string, unknown>;
  const sentiment = (a.sentiment ?? {}) as Record<string, unknown>;
  const bias = (a.bias_rating ?? {}) as Record<string, unknown>;
  const fvo = (a.fact_vs_opinion ?? {}) as Record<string, unknown>;

  const label = String(sentiment.label ?? 'neutral');
  const biasRating = String(bias.rating ?? 'not-determinable');

  return {
    sentiment: {
      score: clamp(Number(sentiment.score) || 0, -1, 1),
      label: (['negative', 'lean-negative', 'neutral', 'lean-positive', 'positive'] as const).includes(label as never)
        ? (label as Analysis['sentiment']['label'])
        : 'neutral',
    },
    bias_rating: {
      rating: (['left', 'lean-left', 'center', 'lean-right', 'right', 'not-determinable'] as const).includes(biasRating as never)
        ? (biasRating as Analysis['bias_rating']['rating'])
        : 'not-determinable',
      confidence: clamp(Number(bias.confidence) || 0, 0, 1),
    },
    framing: String(a.framing ?? ''),
    loaded_language: sanitizeLoadedLanguage(a.loaded_language),
    omissions: toStringArray(a.omissions),
    fact_vs_opinion: {
      factual: clamp(Number(fvo.factual) || 50, 0, 100),
      opinion: clamp(Number(fvo.opinion) || 50, 0, 100),
    },
    tone_keywords: toStringArray(a.tone_keywords).slice(0, 5),
    insufficient_evidence_flags: toStringArray(a.insufficient_evidence_flags),
  };
}

function sanitizeLoadedLanguage(raw: unknown): Analysis['loaded_language'] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return {
      quote: String(e.quote ?? ''),
      explanation: String(e.explanation ?? ''),
      neutral_alternative: String(e.neutral_alternative ?? ''),
    };
  }).filter((e) => e.quote);
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? '')).filter((s) => s.length > 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sanitizeSummary(raw: unknown, outlets: Outlet[]): ClusterAnalysis {
  const a = (raw ?? {}) as Record<string, unknown>;
  const consensusFacts = toStringArray(a.consensus_facts);
  const matrix = Array.isArray(a.agreement_matrix)
    ? (a.agreement_matrix as unknown[]).map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return { a: e.a as Outlet, b: e.b as Outlet, score: clamp(Number(e.score) || 0, 0, 1) };
      }).filter((p) => VALID_OUTLETS.includes(p.a) && VALID_OUTLETS.includes(p.b))
    : [];

  const verdictRaw = (a.verdict ?? {}) as Record<string, unknown>;
  const mostRestrained = (verdictRaw.most_restrained ?? {}) as Record<string, unknown>;
  const mostCharged = (verdictRaw.most_charged ?? {}) as Record<string, unknown>;
  const restrainedOutlet = (VALID_OUTLETS.includes(mostRestrained.outlet as Outlet) ? mostRestrained.outlet : outlets[0] ?? 'skynews') as Outlet;
  const chargedOutlet = (VALID_OUTLETS.includes(mostCharged.outlet as Outlet) ? mostCharged.outlet : outlets[outlets.length - 1] ?? 'npr') as Outlet;

  return {
    consensus_facts: consensusFacts,
    divergence_report: String(a.divergence_report ?? ''),
    spectrum_summary: String(a.spectrum_summary ?? ''),
    agreement_matrix: matrix,
    verdict: {
      most_restrained: { outlet: restrainedOutlet, justification: String(mostRestrained.justification ?? '') },
      most_charged: { outlet: chargedOutlet, justification: String(mostCharged.justification ?? '') },
    },
  };
}
