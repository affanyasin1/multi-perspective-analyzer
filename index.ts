import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createProvider } from './analyze';
import { Archive } from './archive';
import { config, currentLlmMode, LLM_PROVIDERS, persistAutoSync, persistLlmSettings, sanitizeApiKey } from './config';
import { buildDashboard, buildReliability } from './dashboard';
import { buildEvalReport, sampleAnnotationsCsv } from './eval/eval';
import { checkImages, checkLinks, dedupeImages, type BrokenImage, type BrokenLink, type DuplicateImage } from './imageCheck';
import { fetchArticleBody } from './ingest';
import { buildArchiveCsv, buildInsights } from './insights';
import { writeBriefing, type BriefingDigest } from './llm/reporter';
import { runPipeline } from './pipeline';
import { Store } from './store';
import type { Article, Section, WorldBriefing } from './types';

const app = express();
// Local application: reject foreign sites and unexpected Host headers.
const allowedHosts = new Set([`localhost:${config.port}`, `127.0.0.1:${config.port}`]);
const allowedOrigins = new Set([
  `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`,
  'http://localhost:5173', 'http://127.0.0.1:5173',
]);
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!allowedHosts.has(req.get('host') ?? '') ||
      (origin && !allowedOrigins.has(origin)) ||
      req.get('sec-fetch-site') === 'cross-site') {
    res.status(403).json({ error: 'Local access only' });
    return;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  if (req.method === 'POST' && !req.is('application/json') && req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0') {
    res.status(415).json({ error: 'Expected application/json' });
    return;
  }
  next();
});
app.use(express.json());

const store = new Store();
const archive = new Archive(config.archiveFile);

let running = false;
async function refresh(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runPipeline(store, archive);
    const all = [...store.clusters.flatMap((c) => c.articles), ...store.singles];
    logActivity('analyst', `analyzed ${all.filter((a) => a.analysis).length} articles`);
    logActivity('critic', `verified ${all.filter((a) => a.verification_score != null).length} articles`);
    // Fresh data landed — re-verify the new article links right away.
    void runLinkCheck();
  } catch (err) {
    console.error('[pipeline] refresh failed:', err);
    store.markStale(true, (err as Error).message);
  } finally {
    running = false;
  }
}

const imageHealth: { checked_at: string | null; broken: BrokenImage[] } = { checked_at: null, broken: [] };
async function runImageCheck(): Promise<void> {
  try {
    const articles = [...store.clusters.flatMap((c) => c.articles), ...store.singles];
    imageHealth.broken = await checkImages(articles);
    imageHealth.checked_at = new Date().toISOString();
    console.log(`[image-check] ${imageHealth.broken.length} broken image(s) across ${articles.length} articles`);
  } catch (err) {
    console.warn('[image-check] failed:', (err as Error).message);
  }
}

const linkHealth: { checked_at: string | null; broken: BrokenLink[] } = { checked_at: null, broken: [] };
async function runLinkCheck(): Promise<void> {
  try {
    const articles = [...store.clusters.flatMap((c) => c.articles), ...store.singles];
    linkHealth.broken = await checkLinks(articles);
    linkHealth.checked_at = new Date().toISOString();
    console.log(`[link-check] ${linkHealth.broken.length} broken link(s) across ${articles.length} articles`);
  } catch (err) {
    console.warn('[link-check] failed:', (err as Error).message);
  }
}

const dupeHealth: { checked_at: string | null; resolved_total: number; duplicates: DuplicateImage[] } = { checked_at: null, resolved_total: 0, duplicates: [] };
async function runImageDedupe(): Promise<void> {
  if (running) return;
  try {
    const articles = [...store.clusters.flatMap((c) => c.articles), ...store.singles];
    const { resolved, duplicates } = await dedupeImages(articles);
    if (resolved > 0) store.save(store.clusters, store.singles, {});
    dupeHealth.resolved_total += resolved;
    dupeHealth.duplicates = duplicates;
    dupeHealth.checked_at = new Date().toISOString();
    console.log(`[image-dedupe] resolved ${resolved}, ${duplicates.length} duplicate group(s) remain`);
  } catch (err) {
    console.warn('[image-dedupe] failed:', (err as Error).message);
  }
}

// --- Newsroom: World Briefing (Reporter agent) ---
const briefingFile = path.resolve(__dirname, '..', '..', 'data', 'world-briefing.json');
let worldBriefing: WorldBriefing | null = null;
let briefingRunning = false;

interface AgentActivity {
  agent: 'analyst' | 'critic' | 'reporter';
  action: string;
  at: string;
}
const agentActivity: AgentActivity[] = [];

function logActivity(agent: AgentActivity['agent'], action: string): void {
  agentActivity.unshift({ agent, action, at: new Date().toISOString() });
  if (agentActivity.length > 30) agentActivity.length = 30;
}

function loadBriefing(): void {
  try {
    if (fs.existsSync(briefingFile)) {
      worldBriefing = JSON.parse(fs.readFileSync(briefingFile, 'utf-8')) as WorldBriefing;
    }
  } catch {
    // ignore malformed briefing
  }
}

function computeVerificationRate(): { rate: number | null; total: number } {
  const articles = [...store.clusters.flatMap((c) => c.articles), ...store.singles];
  let sum = 0;
  let n = 0;
  for (const a of articles) {
    if (a.verification_score != null) {
      sum += a.verification_score;
      n++;
    }
  }
  return { rate: n ? Math.round((sum / n) * 100) / 100 : null, total: n };
}

async function generateBriefing(): Promise<void> {
  if (briefingRunning) return;
  briefingRunning = true;
  try {
    const digest: BriefingDigest = { stories: [] };
    for (const c of store.clusters) {
      const analyzed = c.articles.filter((a) => a.analysis);
      if (analyzed.length < 2) continue;
      const sentiments = analyzed.map((a) => a.analysis!.sentiment.score);
      digest.stories.push({
        topic: c.topic_label,
        outlets: new Set(analyzed.map((a) => a.outlet)).size,
        sentiment_min: Math.min(...sentiments),
        sentiment_max: Math.max(...sentiments),
        bias_ratings: [...new Set(analyzed.map((a) => a.analysis!.bias_rating.rating))],
        consensus_facts: c.consensus_facts,
        divergence: c.comparison_summary?.divergence_report ?? null,
      });
    }
    if (digest.stories.length === 0) return;
    worldBriefing = await writeBriefing(digest, createProvider());
    fs.mkdirSync(path.dirname(briefingFile), { recursive: true });
    fs.writeFileSync(briefingFile, JSON.stringify(worldBriefing, null, 2), 'utf-8');
    console.log('[briefing] world briefing updated');
    logActivity('reporter', 'wrote world briefing');
  } catch (err) {
    console.warn('[briefing] failed:', (err as Error).message);
  } finally {
    briefingRunning = false;
  }
}

app.use('/api', (req, _res, next) => {
  if (req.method === 'GET') store.reloadIfChanged();
  next();
});

app.get('/api/stories', (req, res) => {
  const section = req.query.section as string | undefined;
  const sort = req.query.sort as string | undefined;

  let clusters = [...store.clusters];
  if (section === 'world' || section === 'politics') {
    clusters = clusters.filter((c) => c.section === (section as Section));
  }
  if (sort === 'newest') {
    clusters.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  } else {
    clusters.sort((a, b) => b.score - a.score);
  }

  res.json({
    clusters,
    singles: store.singles,
    last_updated: store.lastUpdated,
    stale: store.stale,
    last_error: store.lastError,
    refreshing: running,
  });
});

app.get('/api/story/:id', (req, res) => {
  const cluster = store.clusters.find((c) => c.id === req.params.id);
  if (!cluster) {
    res.status(404).json({ error: 'Story not found' });
    return;
  }
  res.json({ cluster });
});

app.get('/api/single/:id', async (req, res) => {
  const single = store.singles.find((s) => s.id === req.params.id);
  if (!single) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  try {
    if (!single.body_text || single.body_text.length <= 40) {
      const { body, incomplete } = await fetchArticleBody(single.url, single.summary);
      single.body_text = body;
      single.body_incomplete = incomplete;
    }
    if (!single.analysis) {
      single.analysis = await createProvider().analyzeArticle(single);
      single.analysis_status = 'done';
      const mode = currentLlmMode();
      single.analysis_provider = mode.provider;
      single.analysis_model = mode.model;
    }
    res.json({ article: single });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/llm/test', async (_req, res) => {
  const provider = createProvider();
  const sample: Article = {
    outlet: 'skynews',
    headline: 'Leaders meet to discuss a proposed peace agreement',
    url: 'https://example.com/llm-test',
    published_at: new Date().toISOString(),
    summary: 'Representatives from several countries met today to discuss a proposed peace agreement.',
    body_text: 'Representatives met today to discuss a peace agreement. Officials described the talks as constructive.',
    image_url: null,
    feed_section: 'world',
    body_incomplete: false,
    analysis: null,
    analysis_status: 'pending',
  };
  const t0 = Date.now();
  try {
    const analysis = await provider.analyzeArticle(sample);
    res.json({
      provider: provider.name,
      model: config.llm.model,
      ok: true,
      latency_ms: Date.now() - t0,
      sample: analysis,
    });
  } catch (err) {
    res.json({
      provider: provider.name,
      model: config.llm.model,
      ok: false,
      latency_ms: Date.now() - t0,
      error: (err as Error).message,
    });
  }
});

app.get('/api/llm/settings', (_req, res) => {
  res.json({
    provider: config.llm.provider,
    model: config.llm.model,
    hasKey: !!config.llm.apiKey,
    providers: LLM_PROVIDERS.map((p) => ({ id: p.id, label: p.label, models: p.models })),
  });
});

app.post('/api/llm/settings', async (req, res) => {
  const body = (req.body ?? {}) as { apiKey?: string; model?: string; provider?: string };
  if (body.provider !== undefined && LLM_PROVIDERS.some((p) => p.id === body.provider)) {
    config.llm.provider = body.provider as string;
  }
  if (body.apiKey !== undefined) config.llm.apiKey = sanitizeApiKey(body.apiKey);
  if (body.model && body.model.trim()) config.llm.model = body.model.trim();

  // Persist first, then test best-effort (saving is not blocked on the test).
  persistLlmSettings();

  const sample: Article = {
    outlet: 'skynews',
    headline: 'Leaders meet to discuss a proposed peace agreement',
    url: 'https://example.com/llm-test',
    published_at: new Date().toISOString(),
    summary: 'Representatives from several countries met today to discuss a proposed peace agreement.',
    body_text: 'Representatives met today to discuss a peace agreement. Officials described the talks as constructive.',
    image_url: null,
    feed_section: 'world',
    body_incomplete: false,
    analysis: null,
    analysis_status: 'pending',
  };

  let testOk = false;
  let latencyMs: number | undefined;
  let error: string | undefined;
  try {
    const provider = createProvider();
    const t0 = Date.now();
    await provider.analyzeArticle(sample);
    testOk = true;
    latencyMs = Date.now() - t0;
  } catch (err) {
    error = (err as Error).message;
  }

  res.json({
    saved: true,
    provider: config.llm.provider,
    model: config.llm.model,
    testOk,
    latency_ms: latencyMs,
    error,
  });
});

app.post('/api/refresh', async (_req, res) => {
  res.setHeader('content-type', 'application/json');
  if (running) {
    res.status(409).json({ error: 'Refresh already in progress' });
    return;
  }
  void refresh();
  res.status(202).json({ started: true });
});

app.get('/api/dashboard', (_req, res) => {
  try {
    res.json(buildDashboard(store.clusters.length, store.crawlHealth));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/reliability', (_req, res) => {
  try {
    res.json({ outlets: buildReliability() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/insights', (_req, res) => {
  try {
    res.json(buildInsights(store.clusters, store.singles));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/eval', (_req, res) => {
  try {
    res.json(buildEvalReport(store.clusters));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/eval/sample', (_req, res) => {
  try {
    const csv = sampleAnnotationsCsv(100);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="annotations.template.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/archive/export.csv', (_req, res) => {
  try {
    const csv = buildArchiveCsv();
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="news-archive.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/image-health', (_req, res) => {
  res.json({
    ...imageHealth,
    duplicates: dupeHealth.duplicates,
    resolved_total: dupeHealth.resolved_total,
    interval_min: config.healthCheckIntervalMin,
  });
});

app.post('/api/image-health', (_req, res) => {
  void runImageCheck();
  res.status(202).json({ started: true });
});

app.get('/api/link-health', (_req, res) => {
  res.json({
    ...linkHealth,
    interval_min: config.healthCheckIntervalMin,
  });
});

app.post('/api/link-health', (_req, res) => {
  void runLinkCheck();
  res.status(202).json({ started: true });
});

app.get('/api/newsroom', (_req, res) => {
  const v = computeVerificationRate();
  res.json({
    briefing: worldBriefing,
    verification_rate: v.rate,
    total_verified: v.total,
    interval_hours: config.briefingIntervalHours,
    last_generated: worldBriefing?.generated_at ?? null,
    activity: agentActivity.slice(0, 20),
    crawling: running,
    briefing_running: briefingRunning,
  });
});

app.post('/api/newsroom/briefing', (_req, res) => {
  void generateBriefing();
  res.status(202).json({ started: true });
});

app.post('/api/newsroom/run', (_req, res) => {
  void (async () => {
    await refresh();
    await generateBriefing();
  })();
  res.status(202).json({ started: true });
});

app.get('/api/autosync', (_req, res) => {
  res.json({ autoSync: config.autoSync });
});

app.post('/api/autosync', (req, res) => {
  const body = (req.body ?? {}) as { autoSync?: boolean };
  if (typeof body.autoSync === 'boolean') {
    config.autoSync = body.autoSync;
    persistAutoSync(body.autoSync);
  }
  res.json({ autoSync: config.autoSync });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    clusters: store.clusters.length,
    stale: store.stale,
    archived: archive.size,
    archive_file: config.archiveFile,
    refresh_interval_min: Math.max(config.minFeedIntervalMin, config.refreshIntervalMin),
    refreshing: running,
    last_updated: store.lastUpdated,
  });
});

// Serve the built client (production) if present.
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(config.port, '127.0.0.1', () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  console.log(`[server] LLM provider: ${config.llm.apiKey ? config.llm.model : 'mock (no key)'}`);
  console.log(`[server] archive: ${config.archiveFile} (${archive.size} articles)`);

  if (store.clusters.length === 0) {
    console.log('[server] no data yet — running initial refresh');
    void refresh();
  }

  const intervalMin = Math.max(config.minFeedIntervalMin, config.refreshIntervalMin);
  setInterval(() => {
    if (config.autoSync) void refresh();
  }, intervalMin * 60 * 1000).unref();
  console.log(`[server] auto-refresh every ${intervalMin} min (auto-sync ${config.autoSync ? 'ON' : 'OFF'})`);

  setInterval(() => {
    void (async () => {
      await runImageDedupe();
      await runImageCheck();
      await runLinkCheck();
    })();
  }, config.healthCheckIntervalMin * 60 * 1000).unref();
  console.log(`[server] image & link health check every ${config.healthCheckIntervalMin} min`);

  loadBriefing();
  setInterval(() => {
    void generateBriefing();
  }, config.briefingIntervalHours * 3600 * 1000).unref();
  console.log(`[server] world briefing every ${config.briefingIntervalHours}h`);
});
