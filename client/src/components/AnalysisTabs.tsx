import { useState } from 'react';
import type { Analysis, Cluster, LoadedLanguage, Outlet } from '../types';
import { OUTLET_NAMES, OUTLET_ORDER } from '../types';
import { biasColor, sentimentLabelClass } from '../utils';

function FactOpinionBar({ analysis }: { analysis: Analysis }) {
  const { factual, opinion } = analysis.fact_vs_opinion;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div className="bg-green-600" style={{ width: `${factual}%` }} />
        <div className="bg-amber-500" style={{ width: `${opinion}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>Factual {factual}%</span>
        <span>Opinion {opinion}%</span>
      </div>
    </div>
  );
}

function LoadedLanguageList({ entries }: { entries: LoadedLanguage[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) {
    return <p className="text-sm text-muted">No loaded language flagged.</p>;
  }
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-line px-2 py-1 text-xs font-medium text-muted hover:border-ink hover:text-ink"
      >
        {open ? 'Hide the exact words' : 'Show the exact words'}
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {entries.map((e, i) => (
            <li key={i} className="rounded border-l-2 border-accent bg-red-50/50 p-2">
              <p className="text-sm italic text-ink">“{e.quote}”</p>
              <p className="mt-1 text-xs text-muted">{e.explanation}</p>
              <p className="mt-0.5 text-xs">
                <span className="text-muted">Neutral alternative: </span>
                <span className="text-green-800">“{e.neutral_alternative}”</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SideBySide({ cluster }: { cluster: Cluster }) {
  const cells = OUTLET_ORDER.filter((o) => cluster.articles.some((a) => a.outlet === o));
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cells.map((outlet) => {
        const article = cluster.articles.find((a) => a.outlet === outlet);
        if (!article) return null;
        const analysis = article.analysis;
        return (
          <div key={outlet} className="flex flex-col border border-line bg-white p-4">
            <div className="font-serif text-lg font-semibold">{OUTLET_NAMES[outlet]}</div>
            {analysis ? (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${sentimentLabelClass(analysis.sentiment.label)}`}
                  >
                    {analysis.sentiment.label} ({analysis.sentiment.score >= 0 ? '+' : ''}
                    {analysis.sentiment.score.toFixed(2)})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: biasColor(analysis.bias_rating.rating) }}
                  />
                  <span>
                    {analysis.bias_rating.rating} · {(analysis.bias_rating.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-muted">
                  <span className="font-medium text-ink">Framing: </span>
                  {analysis.framing}
                </p>
                <div className="flex flex-wrap gap-1">
                  {analysis.tone_keywords.map((t) => (
                    <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                      {t}
                    </span>
                  ))}
                </div>
                <FactOpinionBar analysis={analysis} />
                <LoadedLanguageList entries={analysis.loaded_language} />
              </div>
            ) : article.analysis_status === 'failed' ? (
              <p className="mt-3 text-sm text-red-700">Analysis unavailable.</p>
            ) : (
              <p className="mt-3 text-sm text-muted">Analysis pending.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OmissionsMatrix({ cluster }: { cluster: Cluster }) {
  const outlets = OUTLET_ORDER.filter((o) => cluster.articles.some((a) => a.outlet === o));
  const rows = new Map<string, Set<Outlet>>();

  for (const fact of cluster.consensus_facts) {
    rows.set(fact, new Set(outlets));
  }
  for (const article of cluster.articles) {
    if (!article.analysis) continue;
    for (const omission of article.analysis.omissions) {
      const existing = rows.get(omission) ?? new Set(outlets);
      existing.delete(article.outlet);
      rows.set(omission, existing);
    }
  }

  const factList = [...rows.entries()];
  if (factList.length === 0) {
    return <p className="text-sm text-muted">No fact comparison available yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-line bg-stone-50 px-2 py-1.5 text-left font-medium">Fact</th>
            {outlets.map((o) => (
              <th key={o} className="border border-line bg-stone-50 px-2 py-1.5 text-center font-medium">
                {OUTLET_NAMES[o]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factList.map(([fact, covered]) => (
            <tr key={fact}>
              <td className="border border-line px-2 py-1.5">{fact}</td>
              {outlets.map((o) => (
                <td key={o} className="border border-line px-2 py-1.5 text-center">
                  {covered.has(o) ? (
                    <span className="text-green-700">✓</span>
                  ) : (
                    <span className="text-red-700">✗</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgreementHeatmap({ cluster }: { cluster: Cluster }) {
  const matrix = cluster.comparison_summary?.agreement_matrix ?? [];
  const outlets = OUTLET_ORDER.filter((o) => cluster.articles.some((a) => a.outlet === o));
  const score = (a: Outlet, b: Outlet) => {
    const pair = matrix.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
    return pair?.score ?? 0;
  };
  if (matrix.length === 0) return null;

  return (
    <div className="inline-block">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="px-1" />
            {outlets.map((o) => (
              <th key={o} className="px-1 text-muted">
                {OUTLET_NAMES[o].slice(0, 4)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {outlets.map((a) => (
            <tr key={a}>
              <td className="pr-1 text-muted">{OUTLET_NAMES[a].slice(0, 4)}</td>
              {outlets.map((b) => {
                const s = a === b ? 1 : score(a, b);
                return (
                  <td key={b} className="p-0.5">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded"
                      style={{ backgroundColor: `rgba(139, 30, 30, ${s * 0.85})` }}
                      title={`${OUTLET_NAMES[a]} ↔ ${OUTLET_NAMES[b]}: ${s.toFixed(2)}`}
                    >
                      <span className="text-white">{s.toFixed(1)}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted">Pairwise framing similarity (0–1)</p>
    </div>
  );
}

function Differences({ cluster }: { cluster: Cluster }) {
  const summary = cluster.comparison_summary;
  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-serif text-lg font-semibold">Consensus facts</h3>
        {cluster.consensus_facts.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {cluster.consensus_facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No consensus summary yet.</p>
        )}
      </section>

      <section>
        <h3 className="font-serif text-lg font-semibold">Omissions matrix</h3>
        <div className="mt-3">
          <OmissionsMatrix cluster={cluster} />
        </div>
      </section>

      {summary?.divergence_report && (
        <section>
          <h3 className="font-serif text-lg font-semibold">Where the tellings differ</h3>
          <p className="mt-2 text-sm leading-relaxed">{summary.divergence_report}</p>
        </section>
      )}

      {summary && summary.agreement_matrix.length > 0 && (
        <section>
          <h3 className="font-serif text-lg font-semibold">Agreement matrix</h3>
          <div className="mt-3">
            <AgreementHeatmap cluster={cluster} />
          </div>
        </section>
      )}
    </div>
  );
}

function FullComparison({ cluster }: { cluster: Cluster }) {
  const summary = cluster.comparison_summary;
  const [revealOutlet, setRevealOutlet] = useState<Outlet | null>(null);

  const quotesFor = (outlet: Outlet) => {
    const article = cluster.articles.find((a) => a.outlet === outlet);
    return article?.analysis?.loaded_language ?? [];
  };

  return (
    <div className="space-y-8">
      {summary?.spectrum_summary && (
        <section>
          <h3 className="font-serif text-lg font-semibold">The spectrum</h3>
          <p className="mt-2 text-sm leading-relaxed">{summary.spectrum_summary}</p>
        </section>
      )}

      {summary && (
        <section className="rounded border-2 border-ink p-4">
          <h3 className="font-serif text-lg font-semibold">Verdict</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded bg-green-50 p-3">
              <div className="text-sm font-semibold text-green-900">
                Most restrained telling: {OUTLET_NAMES[summary.verdict.most_restrained.outlet]}
              </div>
              <p className="mt-1 text-sm text-green-900/80">
                {summary.verdict.most_restrained.justification}
              </p>
              {quotesFor(summary.verdict.most_restrained.outlet).length > 0 && (
                <button
                  onClick={() => setRevealOutlet(revealOutlet === summary.verdict.most_restrained.outlet ? null : summary.verdict.most_restrained.outlet)}
                  className="mt-2 text-xs font-medium text-green-800 underline"
                >
                  ⓘ evidence
                </button>
              )}
            </div>
            <div className="rounded bg-red-50 p-3">
              <div className="text-sm font-semibold text-red-900">
                Most charged telling: {OUTLET_NAMES[summary.verdict.most_charged.outlet]}
              </div>
              <p className="mt-1 text-sm text-red-900/80">{summary.verdict.most_charged.justification}</p>
              {quotesFor(summary.verdict.most_charged.outlet).length > 0 && (
                <button
                  onClick={() => setRevealOutlet(revealOutlet === summary.verdict.most_charged.outlet ? null : summary.verdict.most_charged.outlet)}
                  className="mt-2 text-xs font-medium text-red-800 underline"
                >
                  ⓘ evidence
                </button>
              )}
            </div>
          </div>
          {revealOutlet && (
            <div className="mt-3 border-t border-line pt-3">
              <LoadedLanguageList entries={quotesFor(revealOutlet)} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Disclaimer() {
  return (
    <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
      Bias ratings describe language patterns relative to the other coverage in this story, not an
      absolute judgment of the outlet. Analysis generated by an LLM and evidence-quoted; verify before
      citing.
    </footer>
  );
}

type Tab = 'side-by-side' | 'differences' | 'full-comparison';

const TAB_META: Record<Tab, { label: string; description: string }> = {
  'side-by-side': { label: 'Side-by-side', description: 'Each outlet\u2019s analysis in its own column — compare wording, bias, and tone.' },
  'differences': { label: 'Consensus & divergence', description: 'Facts all outlets agree on, what each omitted, and where the tellings diverge.' },
  'full-comparison': { label: 'Full comparison', description: 'The spectrum, plus the most restrained vs. most charged verdict.' },
};

export default function AnalysisTabs({ cluster }: { cluster: Cluster }) {
  const [tab, setTab] = useState<Tab>('side-by-side');
  const outletCount = new Set(cluster.articles.map((a) => a.outlet)).size;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'side-by-side', label: TAB_META['side-by-side'].label, count: outletCount },
    { id: 'differences', label: TAB_META['differences'].label, count: cluster.consensus_facts.length },
    { id: 'full-comparison', label: TAB_META['full-comparison'].label },
  ];

  return (
    <section className="mt-12">
      <div className="newspaper-rule px-1 pt-1">
        <h2 className="text-2xl font-bold">How the coverage differs</h2>
      </div>

      <div className="mt-4 inline-flex flex-wrap rounded-lg border-2 border-ink bg-white p-1 shadow-sm">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                active ? 'bg-accent text-paper' : 'text-muted hover:bg-stone-100 hover:text-ink'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                    active ? 'bg-white/25 text-paper' : 'bg-stone-200 text-muted'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted">{TAB_META[tab].description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="font-medium text-ink">Bias scale:</span>
        {(['left', 'lean-left', 'center', 'lean-right', 'right', 'not-determinable'] as const).map((r) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: biasColor(r) }} />
            {r}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Left–right = progressive vs. conservative framing, judged <em>relative to the other outlets in this story</em> — not a verdict on the outlet.
      </p>

      <div className="mt-6">
        {tab === 'side-by-side' && <SideBySide cluster={cluster} />}
        {tab === 'differences' && <Differences cluster={cluster} />}
        {tab === 'full-comparison' && <FullComparison cluster={cluster} />}
      </div>

      <Disclaimer />
    </section>
  );
}
