import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEval, type EvalReport } from '../api';

function fmt(n: number | null): string {
  return n == null ? '—' : n.toFixed(2);
}

function leanColor(v: number): string {
  if (v < -0.15) return '#1d4ed8';
  if (v > 0.15) return '#b91c1c';
  return '#78716c';
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded border border-line bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-serif text-2xl font-bold">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted">{note}</div>}
    </div>
  );
}

export default function Evaluation() {
  const [data, setData] = useState<EvalReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'standard' | 'human'>('standard');

  useEffect(() => {
    fetchEval()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load evaluation: {error}</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">← Back to stories</Link>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted">Loading evaluation…</div>;
  }

  const ann = data.annotations;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Evaluation</h1>
          <p className="mt-1 text-sm text-muted">
            How well the LLM's bias analysis agrees with independent ground truth and human labels.
          </p>
          <p className="mt-1 text-xs text-muted">Ground truth: {data.ground_truth_source}</p>
        </div>
        <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">← Back</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded border border-line bg-white p-3">
        <span className="text-sm font-medium">Evaluation mode:</span>
        <button
          onClick={() => setMode('standard')}
          className={`rounded-full border px-3 py-1 text-sm ${mode === 'standard' ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink'}`}
        >
          Standard
        </button>
        <button
          onClick={() => setMode('human')}
          className={`rounded-full border px-3 py-1 text-sm ${mode === 'human' ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink'}`}
        >
          Add my annotations
        </button>
        <p className="text-xs text-muted">
          {mode === 'standard'
            ? 'Standard: external standard + automated verification (primary, reproducible).'
            : 'Human: your own annotations (supplementary, small sample, subjective).'}
        </p>
      </div>

      <section className="mt-6">
        <h2 className="font-serif text-xl font-semibold">Bias correlation (LLM vs. ground truth)</h2>
        <p className="mb-3 text-xs text-muted">
          Per-outlet mean LLM lean vs. the reference lean (−1 left … +1 right). Values near +1 mean the
          LLM's inferred lean tracks the reference.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pearson r" value={fmt(data.bias_correlation.pearson_r)} />
          <Stat label="Spearman ρ" value={fmt(data.bias_correlation.spearman_rho)} />
          <Stat label="Outlets" value={String(data.bias_correlation.n)} note="with enough analyzed articles" />
          <Stat label="Verification rate" value={fmt(data.verification_rate)} note="Critic's mean grounding score" />
        </div>

        <div className="mt-4 overflow-x-auto rounded border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-stone-50 text-left">
                <th className="px-3 py-2 font-semibold">Outlet</th>
                <th className="px-3 py-2 font-semibold">Ground-truth lean</th>
                <th className="px-3 py-2 font-semibold">LLM mean lean</th>
                <th className="px-3 py-2 font-semibold">Articles</th>
              </tr>
            </thead>
            <tbody>
              {data.outlets.map((o) => (
                <tr key={o.outlet} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium">{o.outlet}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: leanColor(o.gt_lean) }} />
                      {o.gt_lean.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: leanColor(o.llm_lean ?? 0) }} />
                      {fmt(o.llm_lean)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted">{o.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {mode === 'human' && (
        <>
      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">Inter-annotator agreement (Cohen's κ)</h2>
        <p className="mb-3 text-xs text-muted">
          Agreement between two human annotators, and between the LLM and the first annotator.
        </p>
        {ann.status === 'missing' ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No annotations yet. Download the template, fill in the two-annotator columns, and save it as{' '}
            <code className="rounded bg-white px-1">{ann.file}</code> to enable these metrics.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sentiment κ" value={fmt(data.cohen_kappa.sentiment)} note="annotator 1 vs 2" />
            <Stat label="Bias κ" value={fmt(data.cohen_kappa.bias)} note="annotator 1 vs 2" />
            <Stat label="Sentiment κ (LLM)" value={fmt(data.cohen_kappa.sentiment_llm_vs_gold)} note="LLM vs gold" />
            <Stat label="Bias κ (LLM)" value={fmt(data.cohen_kappa.bias_llm_vs_gold)} note="LLM vs gold" />
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">Topic clustering (precision / recall)</h2>
        <p className="mb-3 text-xs text-muted">
          How well the system's story clusters match human-assigned true topics (ARI and Fowlkes–Mallows).
        </p>
        {ann.status === 'missing' ? (
          <p className="text-sm text-muted">Requires the <code className="rounded bg-stone-100 px-1">true_topic</code> column in annotations.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Adjusted Rand" value={fmt(data.topic.ari)} />
            <Stat label="Fowlkes–Mallows" value={fmt(data.topic.fowlkes_mallows)} />
            <Stat label="Annotated stories" value={String(data.topic.n)} />
          </div>
        )}
      </section>

      <section className="mt-8 rounded border border-line bg-white p-4">
        <h2 className="font-serif text-lg font-semibold">Annotation workflow</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Download the template below (100 analyzed articles, stratified by outlet).</li>
          <li>Have two annotators fill <code className="rounded bg-stone-100 px-1">sentiment_1/2</code> and <code className="rounded bg-stone-100 px-1">bias_1/2</code>, and a shared <code className="rounded bg-stone-100 px-1">true_topic</code> label.</li>
          <li>Save it to <code className="rounded bg-stone-100 px-1">data/annotations.csv</code> and refresh this page.</li>
        </ol>
        <a
          href="/api/eval/sample"
          className="mt-3 inline-block rounded border border-ink bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-stone-800"
        >
          Download annotation template (CSV)
        </a>
        <p className="mt-2 text-xs text-muted">
          Sentiment labels: negative · lean-negative · neutral · lean-positive · positive. Bias:
          left · lean-left · center · lean-right · right.
        </p>
      </section>
        </>
      )}
    </div>
  );
}
