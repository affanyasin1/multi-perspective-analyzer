import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchInsights, type Insights, type OutletAuthenticity } from '../api';
import type { Outlet } from '../types';
import { OUTLET_COLORS } from '../utils';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded border border-line bg-white p-4">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      {children}
    </section>
  );
}

function AuthRow({ a }: { a: OutletAuthenticity }) {
  const color = a.authenticity >= 50 ? '#1a7f37' : a.authenticity >= 20 ? '#b98a2f' : '#c62828';
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-sm font-medium">{a.outlet}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full" style={{ width: `${Math.max(2, a.authenticity)}%`, backgroundColor: color }} />
      </div>
      <div className="w-64 shrink-0 text-right text-xs text-muted">
        {a.recent} recent · {a.label} · {a.authenticity}% · dev {a.avg_sentiment_deviation == null ? '—' : a.avg_sentiment_deviation.toFixed(2)}
      </div>
    </div>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openShift, setOpenShift] = useState<number | null>(null);

  useEffect(() => {
    fetchInsights()
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load insights: {error}</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">← Back to stories</Link>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-muted">Loading insights…</div>;
  }

  const outlets = data.authenticity.map((a) => a.outlet);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Insights</h1>
          <p className="mt-1 text-sm text-muted">
            Trends, topics, and source authenticity from the crawl archive · {data.authenticity.reduce((s, a) => s + a.total, 0)} articles · generated{' '}
            {new Date(data.generated_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/archive/export.csv"
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper"
          >
            Download dataset (CSV)
          </a>
          <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">← Back</Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Articles per day" note="News volume spikes over time">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.articles_by_day}>
                <defs>
                  <linearGradient id="insightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b1e1e" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#8b1e1e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#8b1e1e" fill="url(#insightGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Articles by outlet per day" note="How each source's volume changes">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.outlets_by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {outlets.map((o) => (
                  <Bar key={o} dataKey={o} stackId="a" fill={OUTLET_COLORS[o as Outlet]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title="What's dominating (topics over the last 14 days)" note="Trending events: ≥3 related articles, ≥2 outlets, spanning ≥2 days, in the last 14 days.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.topics.map((t, i) => (
              <div key={i} className="rounded border border-line bg-stone-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-ink px-1.5 py-0.5 text-xs font-bold text-paper">{t.count} articles · {t.days} days</span>
                  <span className="text-[11px] text-muted">{new Date(t.latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <p className="mt-2 font-serif text-sm font-semibold leading-snug">{t.topic}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.outlets.map((o) => (
                    <span key={o} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${OUTLET_COLORS[o as Outlet]}1a`, color: OUTLET_COLORS[o as Outlet] }}>
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {data.topics.length === 0 && <p className="text-sm text-muted">Not enough data yet — topics appear as the archive grows.</p>}
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Source authenticity" note="Corroboration rate × closeness to the story's consensus. A proxy for how consistent a source is with independent coverage — not a truthfulness verdict.">
          <div className="space-y-2">
            {data.authenticity.map((a) => (
              <AuthRow key={a.outlet} a={a} />
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Stance shifts" note="Outlets whose sentiment on a single story moved by 0.5+ between their earliest and latest article.">
          {data.shifts.length === 0 ? (
            <p className="text-sm text-muted">No significant framing shifts detected yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.shifts.map((s, i) => (
                <li key={i} className="rounded border border-line bg-stone-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: `${OUTLET_COLORS[s.outlet as Outlet]}1a`, color: OUTLET_COLORS[s.outlet as Outlet] }}
                    >
                      {s.outlet}
                    </span>
                    <span className="font-medium">{s.story.slice(0, 70)}{s.story.length > 70 ? '…' : ''}</span>
                    <button
                      onClick={() => setOpenShift(openShift === i ? null : i)}
                      className="ml-auto text-xs font-medium text-accent underline"
                    >
                      {openShift === i ? 'Hide details' : 'Details'}
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {s.from.sentiment >= 0 ? '+' : ''}{s.from.sentiment.toFixed(2)} ({s.from.bias}) →{' '}
                    {s.to.sentiment >= 0 ? '+' : ''}{s.to.sentiment.toFixed(2)} ({s.to.bias}) ·{' '}
                    <span className={s.delta >= 0 ? 'text-green-700' : 'text-red-700'}>
                      {s.delta >= 0 ? '▲' : '▼'} {Math.abs(s.delta).toFixed(2)}
                    </span>
                  </div>
                  {openShift === i && (
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
                      <div className="rounded bg-white p-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Earlier · {new Date(s.from.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <a href={s.from.url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-serif text-sm font-semibold hover:underline">
                          {s.from.headline}
                        </a>
                        <div className="mt-1 text-xs text-muted">
                          Sentiment {s.from.sentiment >= 0 ? '+' : ''}{s.from.sentiment.toFixed(2)} · {s.from.bias} · {s.from.framing}
                        </div>
                      </div>
                      <div className="rounded bg-white p-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Later · {new Date(s.to.date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <a href={s.to.url} target="_blank" rel="noopener noreferrer" className="mt-1 block font-serif text-sm font-semibold hover:underline">
                          {s.to.headline}
                        </a>
                        <div className="mt-1 text-xs text-muted">
                          Sentiment {s.to.sentiment >= 0 ? '+' : ''}{s.to.sentiment.toFixed(2)} · {s.to.bias} · {s.to.framing}
                        </div>
                      </div>
                      <Link to={`/story/${s.story_id}`} className="inline-block text-xs font-medium text-accent underline">
                        Open full story comparison →
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-6">
        <Section
          title="Dataset quality"
          note="Completeness of the accumulated archive — methodology and limitations for the research dataset."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded bg-stone-50 p-3">
              <div className="text-xs uppercase tracking-wide text-muted">With image</div>
              <div className="mt-1 font-serif text-2xl font-bold">{data.data_quality.pct_image}%</div>
            </div>
            <div className="rounded bg-stone-50 p-3">
              <div className="text-xs uppercase tracking-wide text-muted">Full body</div>
              <div className="mt-1 font-serif text-2xl font-bold">{100 - data.data_quality.pct_paywalled}%</div>
            </div>
            <div className="rounded bg-stone-50 p-3">
              <div className="text-xs uppercase tracking-wide text-muted">Analyzed</div>
              <div className="mt-1 font-serif text-2xl font-bold">{data.data_quality.pct_analyzed}%</div>
            </div>
            <div className="rounded bg-stone-50 p-3">
              <div className="text-xs uppercase tracking-wide text-muted">Real LLM</div>
              <div className="mt-1 font-serif text-2xl font-bold">{data.data_quality.pct_real}%</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {data.data_quality.total} articles · {data.data_quality.paywalled} paywalled ({data.data_quality.pct_paywalled}%) ·{' '}
            {data.data_quality.failed} failed analyses · {data.data_quality.real_llm} real-LLM vs {data.data_quality.mock} mock rows
          </p>
        </Section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Corroboration tiers" note="Stories by how many distinct sources covered them — today vs all-time.">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['1 source', data.corroboration_tiers.today.single, data.corroboration_tiers.all_time.single],
              ['2 sources', data.corroboration_tiers.today.two, data.corroboration_tiers.all_time.two],
              ['3+ sources', data.corroboration_tiers.today.three_plus, data.corroboration_tiers.all_time.three_plus],
            ] as const).map(([label, today, all]) => (
              <div key={label} className="rounded bg-stone-50 p-3 text-center">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-1 font-serif text-xl font-bold">{today}</div>
                <div className="text-[11px] text-muted">all-time {all}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Sentiment score distribution" note="Analyzed articles per sentiment band (−1..+1).">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.sentiment_histogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="articles" fill="#8b1e1e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Sentiment drift per outlet" note="3-day rolling average sentiment over time — long-run bias drift.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.sentiment_drift.map((d) => (
              <div key={d.outlet}>
                <div className="text-xs font-medium">{d.outlet}</div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.points}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis domain={[-1, 1]} tick={{ fontSize: 9 }} width={24} />
                      <Tooltip />
                      <Line type="monotone" dataKey="avg" stroke={OUTLET_COLORS[d.outlet as Outlet]} strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Posting cadence — by hour" note="Articles captured, bucketed by each outlet's local hour (RSS window, not full output).">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.posting_cadence.by_hour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {outlets.map((o) => (
                  <Bar key={o} dataKey={o} stackId="a" fill={OUTLET_COLORS[o as Outlet]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Posting cadence — by weekday" note="Articles captured, bucketed by each outlet's local weekday (RSS window, not full output).">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.posting_cadence.by_weekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="weekday" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {outlets.map((o) => (
                  <Bar key={o} dataKey={o} stackId="a" fill={OUTLET_COLORS[o as Outlet]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title="Time-to-corroboration" note="Hours until a second source covered a story (from publication timestamps).">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded bg-stone-50 p-3 text-center">
              <div className="text-xs text-muted">Median</div>
              <div className="mt-1 font-serif text-2xl font-bold">{data.corroboration_lag.median_hours ?? '—'}h</div>
            </div>
            <div className="rounded bg-stone-50 p-3 text-center">
              <div className="text-xs text-muted">25th pct</div>
              <div className="mt-1 font-serif text-2xl font-bold">{data.corroboration_lag.p25_hours ?? '—'}h</div>
            </div>
            <div className="rounded bg-stone-50 p-3 text-center">
              <div className="text-xs text-muted">75th pct</div>
              <div className="mt-1 font-serif text-2xl font-bold">{data.corroboration_lag.p75_hours ?? '—'}h</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">{data.corroboration_lag.count} stories with 2+ sources in the current story set.</p>
        </Section>
      </div>
    </div>
  );
}
