# Same Story, Different Lens

One event happens. BBC, Reuters, AP, and The Guardian each publish their version. This app
groups those articles into **one story cluster** and shows how each outlet framed, worded, and
slanted the story differently — with evidence-backed, click-to-reveal analysis.

## How it works

1. **Ingest** — fetches world/politics feeds from 3 outlets (Sky News, France 24, NPR).
2. **Cluster** — groups articles covering the *same event* (entity matching + TF-IDF cosine +
   headline near-duplicate detection, union-find). A story only exists if **2+ distinct outlets**
   covered it.
3. **Rank** — top 10 by cross-outlet coverage, then recency.
4. **Analyze** — per-article LLM analysis (sentiment, bias, framing, loaded language with verbatim
   quotes, omissions, fact/opinion) plus a cluster-level comparison.
5. **Present** — newspaper-style feed and a story detail page with wire-first source cells and a
   three-tab "How the coverage differs" section. Every loaded-language quote sits behind a
   "Show the exact words" expander; every claim links to its quoted evidence.

## Requirements

- Node.js **18+** (tested on 24 LTS)

## Setup

```bash
# from the repo root
npm install        # installs root + server + client deps
npm run seed       # (optional but recommended) populate with a real example cluster
npm run dev        # starts backend (:4000) and frontend (:5173) together
```

Then open **http://localhost:5173**.

> The backend also serves the built client at `http://localhost:4000` after `npm run build`.

## Environment variables (`server/.env`, optional)

Copy `server/.env.example` to `server/.env`. Leave `LLM_API_KEY` empty to use the built-in
**mock provider** (the app runs fully with zero keys).

| Variable | Default | Description |
| --- | --- | --- |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | *(empty)* | API key; empty = mock provider |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |
| `GUARDIAN_API_KEY` | `test` | Guardian Open Platform key (free; register at open-platform.theguardian.com) |
| `PORT` | `4000` | Backend port |
| `REFRESH_INTERVAL_MIN` | `30` | Auto-refresh interval |

Switching to a real LLM is one line: set `LLM_API_KEY` (and `LLM_BASE_URL`/`LLM_MODEL` if using a
compatible gateway).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run backend + frontend in watch mode |
| `npm run build` | Type-check and build both |
| `npm run seed` | Populate `data/store.json` with one fully-worked example cluster |
| `npm start` | Run the compiled backend (serves the built client too) |

## API

- `GET /api/stories?section=world|politics&sort=newest` — top clusters + analyses
- `GET /api/story/:id` — one cluster
- `POST /api/refresh` — trigger a pipeline refresh (returns `202`; poll `/api/stories`)
- `GET /api/health` — liveness

## Data & persistence

Clusters and analyses are persisted to `data/store.json` (gitignored). Analyses are cached by
article URL, so refreshes don't re-bill the LLM for unchanged articles.

## Sources & guardrails

- Official RSS/API endpoints only: BBC News RSS, Reuters RSS, AP News RSS, and The Guardian Open
  Platform (`test` developer key).
- **No paywall bypass, no robots.txt violations.** If an article body can't be fetched, the app
  falls back to the feed summary and flags the article `body_incomplete: true`.
- Feed failures degrade gracefully: the last good data is kept and a staleness warning is shown.
- Reuters/AP occasionally change feed URLs; each is tried with retry/backoff, and a dead feed
  simply drops out (a story still needs 2+ outlets).

### Troubleshooting live ingestion

- **The Guardian `test` key often returns `401 Unauthorized`.** Register a free developer key at
  <https://open-platform.theguardian.com/access/> and set `GUARDIAN_API_KEY` in `server/.env`.
- **AP News may return `403`** from some networks/CDNs (bot protection). Nothing in this app
  bypasses it.
- **BBC / Reuters feeds timed out during development on this machine** (restricted network egress
  to those hosts). On a normal internet connection they resolve fine. Regardless, `npm run seed`
  and the mock provider make the app fully runnable offline.

## Node PATH note (portable install)

If you installed Node as a portable ZIP (not the MSI), add its folder to your `PATH` so the
commands above resolve:

```bash
# Git Bash example
export PATH="$HOME/nodejs/node-v24.20.0-win-x64:$PATH"
```

or set it permanently via System Properties → Environment Variables → Path.


### Local access and shared packages

The backend binds to `127.0.0.1` and accepts browser requests only from local
ports 4000 (or the configured PORT) and 5173. Keep the Vite dev server local.
This is a local application; public deployment requires authentication and HTTPS.
Upstream LLM error response bodies are not returned to the browser.

Shared packages omit `.env` files, dependencies, build output, and Git history.
Install dependencies in the root, `server`, and `client` directories. Copy
`server/.env.example` to `server/.env` and add your own key only if needed; an
empty key uses the mock provider. Never share the populated `.env` file.



## 界面展示 / Interface Preview

以下为历史界面快照，用于说明功能；不作为当前实验结果。
These historical interface snapshots illustrate features, not current experimental results.

### 1. 多家媒体如何报道同一事件 / Compare coverage of the same event

<img width="2077" height="1268" alt="02-outlet-comparison" src="https://github.com/user-attachments/assets/d02be989-75b9-4071-861c-45f890b86a63" />


展示标题、摘要和原文入口，便于并排比较。

Headlines, summaries, and source links support side-by-side reading.

### 2. 原文证据与中性改写 / Quoted evidence and neutral alternatives

<img width="2070" height="1913" alt="03-evidence" src="https://github.com/user-attachments/assets/4cc1175e-489b-43e1-ae65-1617752fa5a5" />


局部界面示例，仅保留 NPR 与 Indian Express 两列。展示模型输出，不代表分析已经人工核实；编号 2、3 沿用原图。

Cropped interface example showing NPR and Indian Express. Model outputs have not been independently verified; callouts 2 and 3 are retained from the original.

### 3. 报道框架相似度 / Framing similarity across reports

<img width="2011" height="993" alt="07-agreement" src="https://github.com/user-attachments/assets/6866614d-a58f-434d-a6de-99e03a0a0c84" />


矩阵为模型估计的框架相似度，不是事实一致率或准确率。

The matrix shows model-estimated framing similarity, not factual agreement or accuracy.

### 4. 单一来源报道 / Single-source reports

<img width="2163" height="1863" alt="08-single-source" src="https://github.com/user-attachments/assets/60f11bf6-8e99-441e-b500-d2d15b3b4b8b" />


仅表示在当前采集与聚类范围内未匹配到其他媒体，不代表其他地方没有相关报道。

Single-source status means no other outlet was matched within the current collection and clustering scope; it does not establish that no other coverage exists.


<img width="2134" height="1363" alt="01-home" src="https://github.com/user-attachments/assets/a4b1eda0-851b-4f48-b8be-c7cd0a8fcbad" />
<img width="2031" height="2068" alt="04-consensus-omissions" src="https://github.com/user-attachments/assets/6496dcf8-993b-402f-acdb-792ada211493" />
<img width="1687" height="1970" alt="05-briefing" src="https://github.com/user-attachments/assets/b6163428-17bd-4a54-8f5f-1f8eac398c6a" />
<img width="1734" height="1460" alt="06-agents" src="https://github.com/user-attachments/assets/a617ff11-e1bb-4735-b759-ee5ac498ef47" />
<img width="2110" height="1961" alt="09-quality" src="https://github.com/user-attachments/assets/a5febda0-c500-419f-855f-18a632fc7303" />
<img width="1669" height="1735" alt="10-evaluation" src="https://github.com/user-attachments/assets/fc75abf2-894d-4f17-b61c-3c1b85a09211" />







