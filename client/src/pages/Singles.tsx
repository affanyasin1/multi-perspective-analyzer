import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStories } from '../api';
import NewsImage from '../components/NewsImage';
import SentimentStrip from '../components/SentimentStrip';
import type { SingleItem } from '../types';
import { OUTLET_NAMES } from '../types';
import { OUTLET_COLORS, formatDateTime, formatRelative } from '../utils';

type Filter = 'all' | 'international' | 'local';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'international', label: 'International' },
  { id: 'local', label: 'Local' },
];

export default function Singles() {
  const [singles, setSingles] = useState<SingleItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStories()
      .then((r) => setSingles(r.singles ?? []))
      .catch((e) => setError((e as Error).message));
  }, []);

  const filtered = useMemo(() => {
    if (!singles) return [];
    if (filter === 'international') return singles.filter((s) => s.international);
    if (filter === 'local') return singles.filter((s) => !s.international);
    return singles;
  }, [singles, filter]);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load reports: {error}</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">
          ← Back to stories
        </Link>
      </div>
    );
  }

  if (!singles) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted">Loading…</div>;
  }

  const intlCount = singles.filter((s) => s.international).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Single-source reports</h1>
          <p className="mt-1 text-sm text-muted">
            Reported by only one outlet so far — less corroborated. Treat with caution.
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">
          ← Back to stories
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f.id ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink hover:border-ink'
            }`}
          >
            {f.label}
            {f.id === 'international' && <span className="ml-1 opacity-70">({intlCount})</span>}
            {f.id === 'local' && <span className="ml-1 opacity-70">({singles.length - intlCount})</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-muted">No reports match this filter right now.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => (
            <Link
              key={a.id}
              to={`/single/${a.id}`}
              className="flex flex-col overflow-hidden border border-line bg-white transition hover:shadow-md"
            >
              <div className="aspect-[16/9] w-full">
                <NewsImage src={a.image_url} alt={a.headline} />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span
                    className="rounded px-1.5 py-0.5 font-medium"
                    style={{ backgroundColor: `${OUTLET_COLORS[a.outlet]}1a`, color: OUTLET_COLORS[a.outlet] }}
                  >
                    {OUTLET_NAMES[a.outlet]}
                  </span>
                  {a.international && (
                    <span
                      className="rounded border border-blue-300 px-1.5 py-0.5 text-blue-600"
                      title="International relevance — mentions 2+ countries or a major international body"
                    >
                      International focus
                    </span>
                  )}
                </div>
                <h2 className="mt-2 font-serif text-base font-semibold leading-snug">{a.headline}</h2>
                <p className="mt-2 flex-1 text-sm text-muted line-clamp-3">{a.summary}</p>
                <SentimentStrip articles={[a]} />
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{formatRelative(a.published_at)} · {formatDateTime(a.published_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
