# Newsroom Multi-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-agent "Newsroom" (Analyst → Critic → Reporter) that produces verified per-article framing analysis plus a corpus-level "World Briefing", surfaced in a new tab with two evaluation modes.

**Architecture:** The existing `Analyzer` LLM call (per-article JSON) stays as the Analyst. A new `Critic` re-reads each article and verifies the Analyst's claims (automated, no human input), storing a `verification_score`. A new `Reporter` writes a half-page `WorldBriefing` from the *verified* story clusters on a 5-hour cadence (+ on-demand). Both are plain LLM calls through the existing providers, with deterministic mock fallback.

**Tech Stack:** TypeScript (server: Express + tsx; client: React + Vite + Tailwind + recharts). **No test framework exists** — every task verifies via `npm run build` (typecheck) plus a `tsx` smoke script or `curl` against the running server.

**Spec:** `docs/superpowers/specs/2026-10-13-newsroom-multiagent-design.md`

## Global Constraints

- All agent outputs must be tagged with `provider` and `model` (and distinguishable from Analyst output) so the exported dataset is filterable.
- The Critic is fully automated and must never read human annotations.
- Mock fallback applies independently to each agent when the real LLM fails (tagged `mock`).
- Reporter cadence is **5 hours**, configurable via `BRIEFING_INTERVAL_HOURS` (default `5`), plus an on-demand `POST /api/newsroom/briefing`.
- New tab name is **"Newsroom"**, linked in the header next to Outlets.

## Review Focus

The five failure modes most likely to bite a real user, and the task that pins each:

1. **LLM returns malformed Critic JSON** → must fall back to mock verification, never crash the crawl. (Task 2)
2. **LLM unavailable (out of balance / 402)** → Critic and Reporter must degrade to mock, and the briefing must still render. (Tasks 2, 3, 5)
3. **No briefing exists yet** (first run / no data) → `/api/newsroom` must return a safe empty state, not 500. (Task 5)
4. **The Reporter hallucinates outside the verified digest** → its prompt is grounded to the digest only; output is a fixed schema. (Task 3)
5. **Human annotations absent** → Evaluation tab defaults to Standard and must not break. (Task 7)

---

### Task 1: Types + provider `complete` exposure

**Files:**
- Modify: `server/src/types.ts` (add `Verification`, `WorldBriefing`, and two `Article` fields)
- Modify: `server/src/llm/providers.ts` (make `complete` public on `AnalysisProvider`)

**Interfaces:**
- Produces:
  - `Verification { score: number; verified_fields: string[]; unsupported_fields: string[]; corrections: { field: string; reason: string; correction: string }[]; provider: string; model: string }`
  - `WorldBriefing { generated_at: string; headline: string; summary: string; divergences: string[]; implications: string; provider: string; model: string }`
  - `Article.verification?: Verification`, `Article.verification_score?: number`
  - `AnalysisProvider.complete(system: string, user: string): Promise<string>` (public)

- [ ] **Step 1: Add `Verification` + `WorldBriefing` interfaces and the two `Article` optional fields to `server/src/types.ts`** (exact shapes above; `Verification.corrections` is `{ field, reason, correction }[]`).

- [ ] **Step 2: Expose `complete` on the provider interface** — in `providers.ts`, add `complete(system: string, user: string): Promise<string>;` to `AnalysisProvider`; rename the private `complete` methods in `OpenAIProvider` and `AnthropicProvider` to the public signature (no logic change). Add a `complete()` to `MockProvider` that throws `new Error('mock has no complete')` (Critic/Reporter short-circuit on `name === 'mock'` before calling it).

- [ ] **Step 3: Build**

Run: `npm run build --prefix server`
Expected: PASS (tsc clean)

- [ ] **Step 4: Commit**

```bash
git add server/src/types.ts server/src/llm/providers.ts
git commit -m "feat(newsroom): add Verification/WorldBriefing types and public provider.complete"
```

---

### Task 2: Critic agent (automated verification)

**Files:**
- Create: `server/src/llm/critic.ts`

**Interfaces:**
- Consumes: `Verification` (Task 1), `AnalysisProvider` (Task 1), `Analysis`, `Article`
- Produces: `criticizeArticle(article: Article, analysis: Analysis, provider: AnalysisProvider): Promise<Verification>`

- [ ] **Step 1: Write the mock smoke script `server/src/critic-test.ts`** (throwaway) that calls `criticizeArticle` with a `MockProvider` and asserts `verification.score >= 0 && verification.score <= 1` and `verified_fields` is a non-empty `string[]`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx src/critic-test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `criticizeArticle` in `server/src/llm/critic.ts`**

- System prompt (verbatim rules): the Critic re-reads the article and the Analyst's JSON; every quoted/loaded-language claim must be verbatim in the text; every framing/bias claim must be attributable to concrete wording; output ONLY JSON matching the `Verification` schema. `verification_score` = fraction of fields grounded. `provider`/`model` fields copied from `config.llm` (reuse `currentLlmMode()`).
- Mock path: if `provider.name === 'mock'`, return a deterministic `Verification` (`score: 0.75`, all fields in `verified_fields`, empty `unsupported_fields`/`corrections`, `provider: 'mock'`).
- Real path: `const raw = await provider.complete(system, user); return sanitizeVerification(parseJson(raw));` — reuse `parseJson` from `./prompts` and write a `sanitizeVerification(raw): Verification` that clamps `score` to `0..1` and coerces the arrays to strings.

- [ ] **Step 4: Run the smoke script**

Run: `npx tsx src/critic-test.ts`
Expected: PASS (prints a valid verification)

- [ ] **Step 5: Delete the throwaway script and build**

Run: `rm src/critic-test.ts && npm run build --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/llm/critic.ts
git commit -m "feat(newsroom): add Critic verification agent"
```

---

### Task 3: Reporter agent (World Briefing)

**Files:**
- Create: `server/src/llm/reporter.ts`

**Interfaces:**
- Consumes: `WorldBriefing` (Task 1), `AnalysisProvider` (Task 1)
- Produces:
  - `BriefingDigest { stories: { topic: string; outlets: number; sentiment_min: number; sentiment_max: number; bias_ratings: string[]; consensus_facts: string[]; divergence: string | null }[] }`
  - `writeBriefing(digest: BriefingDigest, provider: AnalysisProvider): Promise<WorldBriefing>`

- [ ] **Step 1: Write the mock smoke script `server/src/reporter-test.ts`** that calls `writeBriefing` with a one-story `BriefingDigest` and a `MockProvider`, asserting `summary` is a non-empty string and `divergences`/`implications` are `string[]`/`string`.

- [ ] **Step 2: Run it to see it fail**

Run: `npx tsx src/reporter-test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `writeBriefing` in `server/src/llm/reporter.ts`**

- Prompt (grounded): "You are the editor of a news digest. Using ONLY the provided verified story summaries, write a half-page briefing with a headline, a plain-language summary of what is happening, 1–4 specific coverage divergences, and implications. Do not invent facts outside the digest." The user message is the JSON-encoded `digest`.
- Return schema is exactly `WorldBriefing` (headline, summary, divergences[], implications).
- Mock path (`provider.name === 'mock'`): return a deterministic briefing summarizing the story topics from the digest.

- [ ] **Step 4: Run the smoke script**

Run: `npx tsx src/reporter-test.ts`
Expected: PASS

- [ ] **Step 5: Delete the throwaway script and build**

Run: `rm src/reporter-test.ts && npm run build --prefix server`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/llm/reporter.ts
git commit -m "feat(newsroom): add Reporter world-briefing agent"
```

---

### Task 4: Wire Critic into the pipeline + archive

**Files:**
- Modify: `server/src/analyze.ts` (add `verifyArticles`)
- Modify: `server/src/pipeline.ts` (call it after `analyzeSingles`)
- Modify: `server/src/archive.ts` (persist verification fields)

**Interfaces:**
- Consumes: `criticizeArticle` (Task 2), `Verification` (Task 1)
- Produces: `verifyArticles(articles: Article[], provider: AnalysisProvider, mode: { provider: string; model: string }): Promise<void>`

- [ ] **Step 1: Implement `verifyArticles` in `server/src/analyze.ts`** — for each article with `analysis` (done), `await criticizeArticle(...)` and set `article.verification` + `article.verification_score = verification.score`. Catch per-article errors (log + leave verification undefined). Concurrency 4 (reuse `mapConcurrent`).

- [ ] **Step 2: Call it in `pipeline.ts`** — after `await analyzeSingles(singles, provider, cache);`, add `await verifyArticles([...merged.flatMap((c) => c.articles), ...singles], provider, currentLlmMode());` (import `verifyArticles` and `currentLlmMode` if needed).

- [ ] **Step 3: Persist verification in `archive.ts`** — add to `ArchivedArticle`: `verification: Verification | null`, `verification_score: number | null`, and stamp them in `append()` from `a.verification` / `a.verification_score`.

- [ ] **Step 4: Build**

Run: `npm run build --prefix server`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/analyze.ts server/src/pipeline.ts server/src/archive.ts
git commit -m "feat(newsroom): run Critic in pipeline and persist verification"
```

---

### Task 5: World Briefing persistence, schedule, endpoints

**Files:**
- Modify: `server/src/config.ts` (add `briefingIntervalHours`)
- Modify: `server/src/index.ts` (state, `generateBriefing`, endpoints, schedule)

**Interfaces:**
- Consumes: `writeBriefing` (Task 3), `BriefingDigest` (Task 3), `WorldBriefing` (Task 1), `Store`
- Produces:
  - `GET /api/newsroom` → `{ briefing: WorldBriefing | null; verification_rate: number | null; total_verified: number; interval_hours: number; last_generated: string | null }`
  - `POST /api/newsroom/briefing` → `{ started: true }` (202)

- [ ] **Step 1: Add `briefingIntervalHours: Number(process.env.BRIEFING_INTERVAL_HOURS ?? 5)` to `config` in `config.ts`.**

- [ ] **Step 2: Implement briefing generation in `index.ts`** — add `worldBriefing: WorldBriefing | null` state and `generateBriefing()` that: builds a `BriefingDigest` from `store.clusters` (each cluster with ≥2 analyzed articles → topic, outlet count, sentiment min/max, distinct bias ratings, `consensus_facts`, and a divergence string from `comparison_summary?.divergence_report`), calls `writeBriefing(digest, createProvider())`, writes `data/world-briefing.json` (create dir), and updates `worldBriefing`. On startup, load `data/world-briefing.json` if present.

- [ ] **Step 3: Add `verification_rate` computation** — mean of `article.verification_score` over all analyzed articles (clusters + singles), or `null` when none. Expose it via the newsroom response.

- [ ] **Step 4: Add endpoints** — `GET /api/newsroom` (returns briefing + verification_rate + total_verified + interval_hours + last_generated) and `POST /api/newsroom/briefing` (calls `void generateBriefing()` and returns 202). Both must return a safe empty state (no 500) when no briefing/data exists.

- [ ] **Step 5: Schedule it** — in the `app.listen` block, add `setInterval(() => void generateBriefing(), config.briefingIntervalHours * 3600 * 1000).unref();` and log the cadence.

- [ ] **Step 6: Build, then smoke-test the endpoint**

Run: `npm run build --prefix server`, then `curl -sS localhost:4000/api/newsroom`
Expected: 200 JSON with `briefing` (possibly null) and `verification_rate` (possibly null), never 500.

- [ ] **Step 7: Commit**

```bash
git add server/src/config.ts server/src/index.ts
git commit -m "feat(newsroom): world briefing persistence, schedule, and /api/newsroom"
```

---

### Task 6: Newsroom tab (frontend)

**Files:**
- Modify: `client/src/api.ts` (add `NewsroomData` type + `fetchNewsroom` + `generateBriefing`)
- Create: `client/src/pages/Newsroom.tsx`
- Modify: `client/src/App.tsx` (route), `client/src/components/Header.tsx` (nav link)

**Interfaces:**
- Consumes: `WorldBriefing` (Task 1 shape), the `/api/newsroom` response shape (Task 5)
- Produces: `fetchNewsroom(): Promise<NewsroomData>`, `generateBriefing(): Promise<void>`, page at `/newsroom`

- [ ] **Step 1: Add types + fetchers in `api.ts`** — `NewsroomData { briefing: WorldBriefing | null; verification_rate: number | null; total_verified: number; interval_hours: number; last_generated: string | null }`, `fetchNewsroom()`, and `generateBriefing()` (POST to `/api/newsroom/briefing`). Reuse the `WorldBriefing` shape (define it client-side mirroring the server).

- [ ] **Step 2: Create `client/src/pages/Newsroom.tsx`** — header + back link; top card = World Briefing (headline + summary + divergences list + implications, with "generated ~X" and a **"Generate now"** button that POSTs then refetches after a short poll); a "Pipeline" line showing Analyst→Critic→Reporter with counts and `verification_rate`; a note that verification is automated. Show a friendly empty state when `briefing` is null.

- [ ] **Step 3: Add route and nav link** — `App.tsx` route `/newsroom`, `Header.tsx` a "Newsroom" link next to Outlets.

- [ ] **Step 4: Build**

Run: `npm run build --prefix client`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts client/src/pages/Newsroom.tsx client/src/App.tsx client/src/components/Header.tsx
git commit -m "feat(newsroom): add Newsroom tab"
```

---

### Task 7: Evaluation — verification rate + Standard/Human toggle

**Files:**
- Modify: `server/src/eval/eval.ts` (add `verification_rate` to `EvalReport`)
- Modify: `client/src/pages/Evaluation.tsx` (Standard/Human toggle; default Standard)

**Interfaces:**
- Consumes: `Article.verification_score` (Task 1), `EvalReport` (existing)
- Produces: `EvalReport.verification_rate: number | null`

- [ ] **Step 1: Add `verification_rate` to `EvalReport` in `eval.ts`** — mean `verification_score` over analyzed records, or `null` when none. Update the returned object and the client `EvalReport` type in `api.ts`.

- [ ] **Step 2: Add the Standard/Human toggle to `Evaluation.tsx`** — a two-state control (default **Standard**) that, when "Human" is selected, reveals the Cohen's-κ/topic sections (which already show "no annotations yet" when `annotations.csv` is absent). Add a short note that Standard is the primary, reproducible path and Human is optional/user-supplied.

- [ ] **Step 3: Build both**

Run: `npm run build --prefix server && npm run build --prefix client`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/eval/eval.ts client/src/api.ts client/src/pages/Evaluation.tsx
git commit -m "feat(newsroom): verification rate and Standard/Human evaluation toggle"
```
