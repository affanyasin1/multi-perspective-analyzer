import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAutoSync, fetchDashboard, fetchImageHealth, fetchLinkHealth, setAutoSync, triggerImageCheck, triggerLinkCheck, type DashboardData, type ImageHealth, type LinkHealth } from '../api';
import LlmSettings from '../components/LlmSettings';
import ReliabilitySection from '../components/ReliabilitySection';
import type { Outlet } from '../types';
import { OUTLET_COLORS, formatRelative } from '../utils';

const COLORS = ['#c8102e', '#0067a5', '#e07b39', '#00838f', '#2e7d32', '#c2185b', '#6a1b9a'];
const BIAS_RATINGS = ['left', 'lean-left', 'center', 'lean-right', 'right', 'not-determinable'];
const BIAS_COLORS: Record<string, string> = {
  left: '#1d4ed8',
  'lean-left': '#60a5fa',
  center: '#78716c',
  'lean-right': '#f87171',
  right: '#b91c1c',
  'not-determinable': '#a8a29e',
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-line bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-serif text-3xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded border border-line bg-white p-4">
      <h2 className="font-serif text-lg font-semibold">{title}</h2>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imgHealth, setImgHealth] = useState<ImageHealth | null>(null);
  const [linkHealth, setLinkHealth] = useState<LinkHealth | null>(null);
  const [autoSync, setAutoSyncState] = useState(true);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((e) => setError((e as Error).message));
    fetchImageHealth()
      .then(setImgHealth)
      .catch(() => {});
    fetchLinkHealth()
      .then(setLinkHealth)
      .catch(() => {});
    fetchAutoSync()
      .then((s) => setAutoSyncState(s.autoSync))
      .catch(() => {});
  }, []);

  const toggleAutoSync = async (value: boolean) => {
    setAutoSyncState(value);
    try {
      const s = await setAutoSync(value);
      setAutoSyncState(s.autoSync);
    } catch {
      setAutoSyncState(!value);
    }
  };

  const recheckImages = async () => {
    const before = imgHealth?.checked_at;
    try {
      await triggerImageCheck();
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const h = await fetchImageHealth();
        if (h.checked_at !== before) {
          setImgHealth(h);
          return;
        }
      }
      setImgHealth(await fetchImageHealth());
    } catch {
      // ignore re-check errors
    }
  };

  const recheckLinks = async () => {
    const before = linkHealth?.checked_at;
    try {
      await triggerLinkCheck();
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const h = await fetchLinkHealth();
        if (h.checked_at !== before) {
          setLinkHealth(h);
          return;
        }
      }
      setLinkHealth(await fetchLinkHealth());
    } catch {
      // ignore re-check errors
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load dashboard: {error}</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">
          ← Back to stories
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-muted">Loading dashboard…</div>;
  }

  const outletData = Object.entries(data.outlets).map(([name, value]) => ({ name, value }));
  const sentimentData = Object.entries(data.sentiment_labels).map(([name, value]) => ({ name, value }));
  const sentimentByOutlet = data.sentiment_by_outlet.map((s) => ({ name: s.outlet, avg: s.avg, count: s.count }));

  const biasByOutletData = Object.entries(data.bias_by_outlet).map(([outlet, counts]) => {
    const row: Record<string, string | number> = { outlet };
    for (const r of BIAS_RATINGS) row[r] = counts[r] ?? 0;
    return row;
  });

  const maxTone = Math.max(1, ...data.top_tone_keywords.map((t) => t.count));
  const analyzedPct = data.total_articles ? Math.round((data.analyzed_articles / data.total_articles) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Data Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Built from the crawl archive · {data.total_articles} articles · generated{' '}
            {new Date(data.generated_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">
          ← Back to stories
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total articles" value={data.total_articles} sub="unique, from all crawls" />
        <Stat label="Outlets" value={Object.keys(data.outlets).length} sub={Object.keys(data.outlets).join(', ')} />
        <Stat label="Story clusters" value={data.clusters} sub="2+ outlet coverage" />
        <Stat label="Analyzed" value={`${analyzedPct}%`} sub={`${data.analyzed_articles} with LLM analysis`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Articles by outlet" note="Unique articles archived per source">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outletData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="articles" fill="#8b1e1e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Articles published per day" note="How news volume changes over time">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.by_day}>
                <defs>
                  <linearGradient id="gradArt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b1e1e" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#8b1e1e" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="articles" stroke="#8b1e1e" fill="url(#gradArt)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Average sentiment per day" note="−1 negative · 0 neutral · +1 positive">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avg_sentiment" stroke="#0067a5" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Sentiment distribution" note="Share of analyzed articles by sentiment label">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                  {sentimentData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Average sentiment by outlet" note="How each outlet's tone leans across the dataset">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sentimentByOutlet} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="avg" name="avg sentiment">
                  {sentimentByOutlet.map((s, i) => (
                    <Cell key={i} fill={s.avg >= 0 ? '#1a7f37' : '#c62828'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Bias ratings by outlet" note="Counts of left / center / right ratings per source">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={biasByOutletData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="outlet" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {BIAS_RATINGS.map((r) => (
                  <Bar key={r} dataKey={r} stackId="a" fill={BIAS_COLORS[r]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="mt-6 rounded border border-line bg-white p-4">
        <h2 className="font-serif text-lg font-semibold">Most common tone keywords</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.top_tone_keywords.map((t) => {
            const size = 11 + Math.round((t.count / maxTone) * 20);
            return (
              <span
                key={t.keyword}
                className="rounded-full border border-line bg-stone-50 px-3 py-1 text-muted"
                style={{ fontSize: size }}
              >
                {t.keyword} <span className="opacity-60">({t.count})</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded border border-line bg-white p-4">
        <h2 className="font-serif text-lg font-semibold">Crawl health</h2>
        <p className="mb-2 text-xs text-muted">Per-outlet fetch status from the most recent crawl.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.crawl_health)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([outlet, h]) => {
              const lastSuccessMs = h.last_success ? new Date(h.last_success).getTime() : null;
              const stale = !h.ok || (lastSuccessMs != null && Date.now() - lastSuccessMs > 2 * 3600000);
              return (
                <div key={outlet} className="rounded border border-line p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{outlet}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${h.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {h.ok ? 'OK' : 'Error'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {h.ok_feeds}/{h.feeds} feeds · {h.items} articles · checked {new Date(h.checked_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Last success: {h.last_success ? formatRelative(h.last_success) : '—'}
                    {stale && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">stale</span>
                    )}
                  </div>
                  {h.error && <div className="mt-1 truncate text-xs text-red-700" title={h.error}>{h.error}</div>}
                </div>
              );
            })}
          {Object.keys(data.crawl_health).length === 0 && (
            <p className="text-sm text-muted">No crawl health data yet — run a crawl to populate it.</p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Image health</h2>
          <button
            onClick={recheckImages}
            className="rounded border border-ink px-3 py-1 text-xs font-medium hover:bg-ink hover:text-paper"
          >
            Re-check now
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Probes every article image URL for 4xx/5xx/timeouts, every {imgHealth?.interval_min ?? 30} min.
          Last checked {imgHealth?.checked_at ? formatRelative(imgHealth.checked_at) : '—'}.
        </p>
        {imgHealth && imgHealth.broken.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {imgHealth.broken.slice(0, 20).map((b, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: `${OUTLET_COLORS[b.outlet as Outlet]}1a`, color: OUTLET_COLORS[b.outlet as Outlet] }}
                >
                  {b.outlet}
                </span>
                <span className="truncate text-muted">{b.headline}</span>
                <span className="ml-auto shrink-0 text-red-700">{b.status ?? 'timeout'}</span>
              </li>
            ))}
            {imgHealth.broken.length > 20 && (
              <li className="text-xs text-muted">…and {imgHealth.broken.length - 20} more</li>
            )}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{imgHealth?.checked_at ? 'No broken images found ✓' : 'Not checked yet — the first run happens on the next cycle.'}</p>
        )}
        {imgHealth && imgHealth.duplicates.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-xs font-medium text-amber-700">
              Duplicate thumbnails ({imgHealth.duplicates.length} group{imgHealth.duplicates.length === 1 ? '' : 's'})
              {imgHealth.resolved_total > 0 ? ` · ${imgHealth.resolved_total} auto-fixed` : ''}
            </p>
            <ul className="mt-1.5 space-y-1">
              {imgHealth.duplicates.map((g, i) => (
                <li key={i} className="text-xs text-muted">
                  <span className="text-amber-700">{g.count}×</span> {g.articles.map((a) => a.outlet).join(', ')} share the same image
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 rounded border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Link health</h2>
          <button
            onClick={recheckLinks}
            className="rounded border border-ink px-3 py-1 text-xs font-medium hover:bg-ink hover:text-paper"
          >
            Re-check now
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Verifies the original-article links (Read at outlet ↗) for 4xx/5xx/timeouts — after each crawl and
          every {linkHealth?.interval_min ?? 30} min. A 403 is usually bot-protection, not a dead link.
        </p>
        {linkHealth && linkHealth.broken.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {linkHealth.broken.slice(0, 20).map((b, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: `${OUTLET_COLORS[b.outlet as Outlet]}1a`, color: OUTLET_COLORS[b.outlet as Outlet] }}
                >
                  {b.outlet}
                </span>
                <span className="truncate text-muted">{b.headline}</span>
                <span className="ml-auto shrink-0 text-red-700">
                  {b.status == null ? 'timeout' : b.status === 403 ? '403 (blocked?)' : b.status}
                </span>
              </li>
            ))}
            {linkHealth.broken.length > 20 && (
              <li className="text-xs text-muted">…and {linkHealth.broken.length - 20} more</li>
            )}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{linkHealth?.checked_at ? 'No broken links found ✓' : 'Not checked yet.'}</p>
        )}
      </div>

      <ReliabilitySection />

      <div className="mt-6 rounded border border-line bg-white p-4">
        <h2 className="font-serif text-lg font-semibold">Auto-sync</h2>
        <p className="mt-1 text-xs text-muted">
          When ON, the server refreshes feeds automatically on its schedule. When OFF, updates happen only when you press Sync.
        </p>
        <div className="mt-3 flex items-center gap-3">
          {(['on', 'off'] as const).map((v) => {
            const active = (v === 'on') === autoSync;
            return (
              <label
                key={v}
                className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm ${active ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink'}`}
              >
                <input
                  type="radio"
                  name="autosync"
                  checked={active}
                  onChange={() => toggleAutoSync(v === 'on')}
                  className="sr-only"
                />
                {v === 'on' ? 'On' : 'Off'}
              </label>
            );
          })}
        </div>
      </div>

      <LlmSettings />
    </div>
  );
}
