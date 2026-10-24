import 'dotenv/config';
import { createProvider } from './analyze';
import { config } from './config';
import type { Article } from './types';

async function main(): Promise<void> {
  const provider = createProvider();
  console.log(`[llm:test] provider=${provider.name} model=${config.llm.model}`);
  if (provider.name === 'mock') {
    console.log('[llm:test] No LLM_API_KEY set — running in MOCK mode (no network call).');
  }

  const article: Article = {
    outlet: 'skynews',
    headline: 'Leaders meet to discuss a proposed peace agreement',
    url: 'https://example.com/llm-test',
    published_at: new Date().toISOString(),
    summary: 'Representatives from several countries met today to discuss a proposed peace agreement.',
    body_text:
      'Representatives from several countries met today to discuss a proposed peace agreement. Officials described the talks as constructive.',
    image_url: null,
    feed_section: 'world',
    body_incomplete: false,
    analysis: null,
    analysis_status: 'pending',
  };

  const t0 = Date.now();
  try {
    const analysis = await provider.analyzeArticle(article);
    console.log(`[llm:test] OK in ${Date.now() - t0}ms`);
    console.log(JSON.stringify(analysis, null, 2));
  } catch (err) {
    console.error(`[llm:test] FAILED: ${(err as Error).message}`);
    process.exit(1);
  }
}

void main();
