# "Newsroom" — Multi-Agent Analysis Layer · Design Spec

Date: 2026-10-13
Status: Draft (pending review)

## Goal

Add a three-agent "newsroom" on top of the existing per-article analysis, so the
app both produces *more reliable* framing analysis (a research contribution) and
an *interactive world briefing* (a shareable product). The agents are:

1. **Analyst** — per-article bias/sentiment/framing analysis.
2. **Critic** — automated verification of the Analyst's work (no human input).
3. **Reporter** — corpus-level "World Briefing" written after everything is verified.

This is surfaced in a new **"Newsroom"** tab (next to Outlets), with evaluation
split into two modes: a **Standard** path (default, no human data) and an optional
**Human-in-the-loop** path.

## Why this is a research contribution (the claim)

> A generate → verify → synthesize multi-agent framework produces cross-outlet
> news framing analysis that is **more grounded and more consistent with an
> external reference standard** than a single-pass LLM.

The measurable pieces are the Critic's **evidence-verification rate** (automated)
and the existing **MBFC-style lean correlation** (external standard). Human
annotation is strictly optional and never the basis of the headline claim.

## Assumptions / dependencies

- A **working LLM key** is required (currently DeepSeek is out of balance → the
  app falls back to mock). Agents multiply API calls.
- All three agents use the existing `LLM_PROVIDERS` / provider selection; each
  output is tagged with `provider`, `model`, and an `agent` name for the dataset.
- The existing Evaluation tab (MBFC correlation, Cohen's κ, topic P/R) is reused
  and extended — not replaced.

## The three agents

### 1. Analyst (exists — mostly unchanged)

`server/src/llm/providers.ts` `analyzeArticle` → the current per-article JSON
(sentiment, bias_rating, framing, loaded_language, omissions, fact_vs_opinion,
tone_keywords, insufficient_evidence_flags). No change to its contract.

### 2. Critic (new — automated verification)

For each article, after the Analyst runs, the Critic re-reads the article text and
the Analyst's output and returns:

```json
{
  "verification_score": 0.0..1.0,
  "verified_fields": ["sentiment", "framing", ...],
  "unsupported_fields": ["loaded_language", ...],
  "corrections": [{ "field": "...", "reason": "...", "correction": "..." }]
}
```

Rules (in the Critic's prompt, mirroring the Analyst's evidence rules):
- Every quote claim must be **verbatim** in the article text, else `unsupported`.
- Framing/bias claims must be **attributable** to concrete wording, else `unsupported`.
- `verification_score` = fraction of fields the Critic could ground.

Stored per article as `verification: { score, fields, corrections }` and
`verification_score` (denormalized) for charting. Tagged `agent: 'critic'`.

**This is fully automated** — it never reads human annotations.

### 3. Reporter (new — corpus-level World Briefing)

After a crawl's analyses are verified, the Reporter takes a **digest of the
verified story clusters** (topic label, outlet count, sentiment/bias spread,
consensus facts, key divergences) and writes a ~half-page brief:

```json
{
  "headline": "…",
  "summary": "what is happening now…",
  "divergences": ["story X: outlets split …", "…"],
  "implications": "what it means / what to watch…"
}
```

- **Grounding:** the Reporter only receives *verified* fields, so it summarizes
  what the Critic signed off on (reduces hallucination).
- **Scheduling:** regenerated on a **5-hour cadence** (configurable, e.g.
  `BRIEFING_INTERVAL_HOURS=5`), independent of crawl frequency, plus on-demand.
  Stored as `data/world-briefing.json` + surfaced in the Newsroom tab.
- Tagged `agent: 'reporter'`.

## Data flow (per crawl)

```
ingest → cluster
  → Analyst  (analyzeAll / analyzeSingles)
  → Critic   (verify each analyzed article)
  → Reporter (world briefing from verified clusters)
  → enrichImages → archive (with verification + agent tags) → save
```

The Critic runs in the pipeline (concurrency-limited, same as analysis). If the
LLM fails, the mock fallback applies to each agent independently (tagged `mock`).

## Verification score — the measurable metric

- `verification_rate` = mean Critic `verification_score` over the corpus.
- Reported in the **Newsroom** tab and the **Evaluation** tab.
- Used as the research metric alongside MBFC correlation: "verification raises
  grounding; correlation confirms alignment with an external standard."

## Two evaluation modes

### Standard (default)

No human data. Justifiable via external standard + internal consistency:

1. **MBFC-style lean correlation** — per-outlet LLM lean vs. `groundtruth.json`
   reference lean (Pearson/Spearman). Already implemented.
2. **Critic verification rate** — automated grounding score.
3. *(optional)* **agent self-consistency** — if a panel is later added.

### Human-in-the-loop (opt-in)

User supplies `data/annotations.csv` (two annotators + `true_topic`) → Cohen's κ
and topic ARI/FM, computed as a *supplementary* check. Clearly labelled
"user-supplied, small sample, subjective — not the primary claim."

The Evaluation tab gets a toggle: **Standard (default)** vs. **Add my annotations**.

## Newsroom tab (UI)

`/newsroom`, linked in the header next to Outlets. Layout (top → bottom):

1. **World Briefing** — the Reporter's half-page summary (headline + body), with
   "generated ~X" and a **"Generate now"** button that triggers an on-demand
   regeneration (via `POST /api/newsroom/briefing`) instead of waiting for the
   5-hour schedule.
2. **Pipeline status** — three stages (Analyst → Critic → Reporter) with counts
   and the current `verification_rate`.
3. **Verification scores** — per-outlet mean verification score (bar chart), and
   a list of the most "unsupported" claims to inspect.
4. **Evaluation toggle** — Standard vs. Human-in-the-loop (delegates to the
   existing Evaluation metrics).

## Files touched (summary)

- New: `server/src/llm/critic.ts`, `server/src/llm/reporter.ts`
  (prompts + sanitizers), `client/src/pages/Newsroom.tsx`.
- Modified: `server/src/types.ts` (verification fields + agent tag),
  `server/src/analyze.ts` (run Critic after Analyst), `server/src/pipeline.ts`
  (Reporter step + world-briefing persistence), `server/src/index.ts`
  (`/api/newsroom` endpoint), `server/src/eval/eval.ts` (verification rate),
  `client/src/api.ts`, `client/src/App.tsx` (route), `client/src/components/Header.tsx`
  (nav link), `client/src/pages/Evaluation.tsx` (Standard/Human toggle).

## Verification / acceptance criteria

- `npm run build` (server + client) passes.
- A crawl produces: per-article `verification` objects, a `verification_rate`,
  and `data/world-briefing.json`.
- `/api/newsroom` returns the briefing + pipeline status + per-outlet scores.
- Evaluation tab defaults to **Standard** and still shows MBFC correlation;
  Human toggle only activates when `annotations.csv` exists.
- Agent outputs are tagged (`analyst` / `critic` / `reporter` + provider/model) so
  they're filterable in the exported dataset.

## Out of scope (not in this change)

- Panel/consensus agents (a separate, later architecture).
- Replacing TF-IDF clustering with embeddings/NER.
- Deployment / public hosting.
- Retrofitting verification onto already-archived articles (new crawls only).

## Resolved decisions

- Reporter cadence: **every 5 hours** (not per-crawl) — keeps LLM cost bounded as
  the corpus grows.
