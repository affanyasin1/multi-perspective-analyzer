import type { Analysis, Article, Verification } from '../types';
import { currentLlmMode } from '../config';
import { parseJson } from './prompts';
import type { AnalysisProvider } from './providers';

const CRITIC_SYSTEM = `You are a careful fact-checker verifying a media-bias analysis against the article it claims to describe.

Hard rules:
- Every quoted / loaded-language claim MUST appear verbatim in the article text. If it does not, list that field under unsupported_fields.
- Every framing, bias, and sentiment claim MUST be attributable to concrete wording in the article. If it is not, list that field under unsupported_fields.
- verification_score is the fraction of fields you could ground. Do not invent evidence.
- Output ONLY valid JSON matching the requested schema. No commentary outside the JSON.`;

function toStringArray(x: unknown): string[] {
  return Array.isArray(x) ? x.map((s) => String(s ?? '')).filter((s) => s.length > 0) : [];
}

function sanitizeVerification(raw: unknown, provider: string, model: string): Verification {
  const a = (raw ?? {}) as Record<string, unknown>;
  const corrections = Array.isArray(a.corrections)
    ? (a.corrections as unknown[]).map((c) => {
        const e = (c ?? {}) as Record<string, unknown>;
        return { field: String(e.field ?? ''), reason: String(e.reason ?? ''), correction: String(e.correction ?? '') };
      }).filter((c) => c.field.length > 0)
    : [];
  const rawScore = Number(a.verification_score ?? a.score ?? 0);
  const score = Number.isFinite(rawScore) ? rawScore : 0;
  return {
    score: Math.min(1, Math.max(0, score)),
    verified_fields: toStringArray(a.verified_fields),
    unsupported_fields: toStringArray(a.unsupported_fields),
    corrections,
    provider,
    model,
  };
}

// Automated verification: the Critic re-reads the article and checks the
// Analyst's claims. Never reads human annotations.
export async function criticizeArticle(
  article: Article,
  analysis: Analysis,
  provider: AnalysisProvider,
): Promise<Verification> {
  const mode = currentLlmMode();

  if (provider.name === 'mock') {
    return {
      score: 0.75,
      verified_fields: ['sentiment', 'bias_rating', 'framing', 'fact_vs_opinion'],
      unsupported_fields: [],
      corrections: [],
      provider: 'mock',
      model: '',
    };
  }

  const body = article.body_text && article.body_text.length > 40 ? article.body_text : article.summary;
  const user = `Article (outlet ${article.outlet}, headline: ${article.headline}):
${body}

Analysis to verify:
${JSON.stringify(analysis, null, 2)}

Return JSON with EXACTLY this schema:
{
  "verification_score": <number 0..1, the fraction of fields you could ground in the article>,
  "verified_fields": [<field names that check out>],
  "unsupported_fields": [<field names lacking verbatim / attributable support>],
  "corrections": [ { "field": <name>, "reason": <why>, "correction": <fixed value or empty string> } ]
}`;

  const content = await provider.complete(CRITIC_SYSTEM, user);
  return sanitizeVerification(parseJson<unknown>(content), mode.provider, mode.model);
}
