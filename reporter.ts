import type { WorldBriefing } from '../types';
import { currentLlmMode } from '../config';
import { parseJson } from './prompts';
import type { AnalysisProvider } from './providers';

export interface BriefingDigest {
  stories: {
    topic: string;
    outlets: number;
    sentiment_min: number;
    sentiment_max: number;
    bias_ratings: string[];
    consensus_facts: string[];
    divergence: string | null;
  }[];
}

const REPORTER_SYSTEM = `You are the editor of a news digest. Using ONLY the verified story summaries you are given, write a half-page briefing for a reader.

Hard rules:
- Do NOT invent any fact, figure, or story outside the digest.
- The briefing has: a headline, a plain-language summary of what is happening now, 1–4 specific coverage divergences, and implications of what it means / what to watch.
- Output ONLY valid JSON matching the requested schema. No commentary outside the JSON.`;

function sanitizeBriefing(raw: unknown, provider: string, model: string): WorldBriefing {
  const a = (raw ?? {}) as Record<string, unknown>;
  const divergences = Array.isArray(a.divergences)
    ? a.divergences.map((s) => String(s ?? '')).filter((s) => s.length > 0)
    : [];
  return {
    generated_at: new Date().toISOString(),
    headline: String(a.headline ?? ''),
    summary: String(a.summary ?? ''),
    divergences,
    implications: String(a.implications ?? ''),
    provider,
    model,
  };
}

export async function writeBriefing(digest: BriefingDigest, provider: AnalysisProvider): Promise<WorldBriefing> {
  const mode = currentLlmMode();

  if (provider.name === 'mock') {
    const topics = digest.stories.slice(0, 5).map((s) => s.topic).join('; ');
    return {
      generated_at: new Date().toISOString(),
      headline: 'World briefing',
      summary: `Coverage spans ${digest.stories.length} story(ies): ${topics || 'none yet'}.`,
      divergences: digest.stories.filter((s) => s.divergence).slice(0, 4).map((s) => s.divergence as string),
      implications: 'Watch how coverage converges as more outlets report.',
      provider: 'mock',
      model: '',
    };
  }

  const user = `Verified story summaries (use ONLY these):
${JSON.stringify(digest, null, 2)}

Return JSON with EXACTLY this schema:
{
  "headline": <short headline>,
  "summary": <half-page plain-language summary of what is happening now>,
  "divergences": [ <1–4 sentences on where coverage differs> ],
  "implications": <what it means / what to watch>
}`;

  const content = await provider.complete(REPORTER_SYSTEM, user);
  return sanitizeBriefing(parseJson<unknown>(content), mode.provider, mode.model);
}
