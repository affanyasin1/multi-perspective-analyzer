# Reproducibility & Evaluation — Design Spec

Date: 2026-10-11
Status: Draft (pending user review)

## Goal

Make the "Same Story, Different Lens" dataset and methodology reproducible and
reviewable for a paper, and add an evaluation harness that validates the LLM
analysis against independent ground truth. Three deliverables:

1. **Prompt + model versioning as artifacts** — every analysis is traceable to
   the exact prompt text, temperature, and model used.
2. **Evaluation harness** — a script producing bias correlation (LLM vs. MBFC),
   inter-annotator Cohen's κ, and topic clustering precision/recall.
3. **Data codebook + schema versioning** — `data/README.md` documents every
   field; each archive record carries a `schema_version`.

Assumptions (user dismissed the clarifying questions; proceeding with
recommended defaults):

- Ground truth is **pre-filled from best-effort MBFC/AllSides knowledge** in an
  editable `data/groundtruth.json`, clearly flagged "approximate — verify before
  citing."
- Annotation workflow uses **two annotators + a true_topic column** (enables
  Cohen's κ and LLM-vs-human agreement).

---

## 1. Prompt + model versioning

### 1.1 Temperature is configurable and recorded

- `server/src/config.ts`: add `temperature: Number(process.env.LLM_TEMPERATURE ?? 0)`
  to `config.llm`, and persist it in `persistLlmSettings()` as `LLM_TEMPERATURE`.
- `server/src/llm/providers.ts`: replace the hard-coded `temperature: 0` in
  `OpenAIProvider.complete` with `config.llm.temperature`; add `temperature:
  config.llm.temperature` to the `AnthropicProvider` request body.

### 1.2 Stable prompt fingerprints

`server/src/llm/prompts.ts` currently builds the user prompt inline. Refactor to
separate the **methodology** (system instruction + JSON schema contract) from
the **input data** (outlet/headline/summary/body). The methodology part is what
is versioned; article text is data, not a prompt change.

- Extract two constants: `ARTICLE_SCHEMA` and `CLUSTER_SCHEMA` (the static
  "Return JSON with EXACTLY this schema…" blocks). `articlePrompt` /
  `clusterPrompt` keep composing them with the per-article fields.
- Add `server/src/llm/hash.ts` with `sha256Hex(input: string): string` using
  `node:crypto`.
- Add `promptFingerprints()` returning `{ article: string; cluster: string }`
  where each is `sha256Hex(system + '\n\n' + schema)`. Uses `ARTICLE_SYSTEM +
  ARTICLE_SCHEMA` and `CLUSTER_SYSTEM + CLUSTER_SCHEMA`.

### 1.3 Prompt snapshots written as content-addressed artifacts

New `server/src/artifacts.ts`:

- `exportPromptArtifacts(dir: string): { articleHash: string; clusterHash: string }`
  writes, for each kind (article, cluster), a file
  `data/prompts/prompt-<hash>.json` containing
  `{ kind, sha256, system, schema, generated_at }`, and updates
  `data/prompts/INDEX.json` mapping `sha256 -> { kind, file, generated_at }`.
- Content-addressing makes the write idempotent: same prompt → same file, skip if
  it already exists.

### 1.4 Traceability on each article and archive record

- `server/src/types.ts`: add optional `prompt_hash?: string; temperature?: number;`
  to `Article` (mirrored in `client/src/types.ts`).
- `server/src/analyze.ts` (`analyzeAll`): when the real provider is used
  (`mode.provider !== 'mock'`), compute the article fingerprint once and set
  `article.prompt_hash` and `article.temperature = config.llm.temperature`.
  Mock analyses leave these empty (already identifiable via `analysis_provider:
  'mock'`).
- `server/src/index.ts` `/api/single/:id`: same for on-demand single analysis.
- `server/src/archive.ts` (`append`): stamp `prompt_hash` and `temperature` from
  the article onto the `ArchivedArticle` record.

## 2. Schema versioning

- New `server/src/schema.ts`: `export const SCHEMA_VERSION = '1.1.0';` plus a
  short `SCHEMA_CHANGELOG` comment (1.0.0 = original; 1.1.0 = added
  analysis_provider/model, schema_version, prompt_hash, temperature).
- `server/src/archive.ts` `ArchivedArticle` gains `schema_version: string;
  prompt_hash: string; temperature: number | null;` and `append()` stamps
  `schema_version: SCHEMA_VERSION`.
- Historical records (already in `data/archive.jsonl`) have no `schema_version`;
  all readers treat missing as `'1.0.0'`.
- CSV export (`buildArchiveCsv`) gains `schema_version`, `prompt_hash`,
  `temperature` columns (exact order in the codebook).

## 3. Evaluation harness

New module `server/src/eval/` with **no new dependencies** (metrics implemented
in plain TS):

- `server/src/eval/metrics.ts` — `pearson`, `spearman`, `cohenKappa` (unweighted
  + linear/quadratic weighted), `adjustedRandIndex`, `fowlkesMallows`.
- `server/src/eval/groundtruth.ts` — loads `data/groundtruth.json`, maps outlet
  lean to numeric `-1..1`.
- `server/src/eval/sample.ts` — `npm run eval:sample` writes
  `data/annotations.template.csv`: ~100 analyzed articles (stratified by outlet)
  with prefilled `url, outlet, headline, published_at` and empty
  `sentiment_1, sentiment_2, bias_1, bias_2, true_topic`.
- `server/src/eval.ts` — `npm run eval` entrypoint.

### 3.1 Ground truth file

`data/groundtruth.json`:

```json
{
  "source": "Media Bias/Fact Check — approximate, verify before citing",
  "updated_at": "2026-10-11",
  "outlets": {
    "skynews":       { "lean": 0.0,  "country": "UK",       "ownership": "Comcast (Sky Group)" },
    "france24":      { "lean": -0.25,"country": "France",   "ownership": "France Médias Monde (state-funded)" },
    "npr":           { "lean": -0.5, "country": "USA",      "ownership": "Non-profit / public funding" },
    "indianexpress": { "lean": -0.25,"country": "India",    "ownership": "Indian Express Group" },
    "irna":          { "lean": -0.5, "country": "Iran",     "ownership": "State media" },
    "mehrnews":      { "lean": -0.5, "country": "Iran",     "ownership": "State-aligned" },
    "thenews":       { "lean": 0.0,  "country": "Pakistan", "ownership": "Jang Group" },
    "dohanews":      { "lean": 0.0,  "country": "Qatar",    "ownership": "Independent" }
  }
}
```

### 3.2 Metrics produced (`npm run eval`)

Reads `data/archive.jsonl`, `data/store.json` (cluster membership), and
`data/annotations.csv` (renamed from the template once filled).

1. **Bias correlation** — per-outlet mean LLM lean (numeric from
   `bias_rating.rating`, n=8 outlets) vs. ground-truth lean: Pearson `r` and
   Spearman `ρ`, plus a per-outlet signed-error table.
2. **Inter-annotator Cohen's κ** — sentiment κ and bias κ between annotator 1 and
   annotator 2 (unweighted, with weighted variants reported alongside).
3. **LLM vs. human agreement** — accuracy and Cohen's κ between the LLM label and
   annotator-1 (gold) label for sentiment and bias on the annotated subset.
4. **Topic clustering** — Adjusted Rand Index and Fowlkes–Mallows between
   `true_topic` and the system cluster assignment (from `store.json`), plus a
   micro-averaged precision/recall via best cluster↔topic matching.

Outputs: console summary, `data/eval-report.json` (machine-readable), and
`data/eval-report.md` (human-readable).

## 4. Data codebook

`data/README.md` documents:

- **Files** — `archive.jsonl`, `store.json`, `groundtruth.json`,
  `annotations.template.csv` → `annotations.csv`, `eval-report.{json,md}`,
  `prompts/`.
- **`archive.jsonl` field table** — every field with type + description,
  including the new `schema_version`, `analysis_provider`, `analysis_model`,
  `prompt_hash`, `temperature`.
- **CSV export columns** — exact order matching `buildArchiveCsv`.
- **`store.json` schema** — clusters, singles, `last_updated`, `stale`.
- **`groundtruth.json` + annotations CSV schemas** — allowed label values
  (`negative|lean-negative|neutral|lean-positive|positive`, and
  `left|lean-left|center|lean-right|right|not-determinable`).
- **Schema versioning policy** — semver; missing `schema_version` = `1.0.0`;
  migration notes.
- **License note** — data CC-BY 4.0, code MIT (documented; files added when the
  user requests deploy/share step).

## Files touched (summary)

- New: `server/src/schema.ts`, `server/src/llm/hash.ts`,
  `server/src/artifacts.ts`, `server/src/eval/{metrics,groundtruth,sample,eval}.ts`,
  `data/README.md`, `data/groundtruth.json`.
- Modified: `server/src/config.ts`, `server/src/llm/providers.ts`,
  `server/src/llm/prompts.ts`, `server/src/types.ts`, `client/src/types.ts`,
  `server/src/analyze.ts`, `server/src/index.ts`, `server/src/archive.ts`,
  `server/src/insights.ts`, `server/package.json` (add `eval`, `eval:sample`).
- Data changed at runtime: `data/archive.jsonl` (new fields on future records),
  `data/prompts/` (new).

## Verification

- `npm run build --prefix server` and `--prefix client` pass.
- `npm run eval:sample` produces `data/annotations.template.csv` with the
  expected columns.
- `npm run eval` produces `data/eval-report.json` + `.md` and prints the
  correlation/κ/clustering numbers (correlation may be weak with n=8 outlets —
  reported honestly, not a failure).
- Re-crawl; confirm `data/archive.jsonl` new records carry `schema_version`,
  `prompt_hash`, `temperature`, and the CSV header includes the new columns.

## Out of scope (not in this change)

- Deployment / public hosting / licensing files (separate share step).
- Bookmark/hide/follow UX (user explicitly deferred).
- Changing clustering/topic algorithms (already addressed in prior work).
