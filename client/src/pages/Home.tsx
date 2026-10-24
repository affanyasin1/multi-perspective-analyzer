import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHealth, fetchStories, triggerRefresh } from '../api';
import { computeMood } from '../components/Chameleon';
import FloatingPet from '../components/FloatingPet';
import Header from '../components/Header';
import NewsImage from '../components/NewsImage';
import StoryCard from '../components/StoryCard';
import SentimentStrip from '../components/SentimentStrip';
import type { Section, StoriesResponse } from '../types';
import { OUTLET_NAMES } from '../types';
import { OUTLET_COLORS, formatRelative } from '../utils';

type SortMode = 'coverage' | 'newest';
type SectionFilter = 'all' | Section;

export default function Home() {
  const [data, setData] = useState<StoriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionFilter>('all');
  const [sort, setSort] = useState<SortMode>('coverage');
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(12);

  const load = useCallback(async (s: SectionFilter, so: SortMode) => {
    try {
      const result = await fetchStories({
        section: s === 'all' ? undefined : s,
        sort: so === 'newest' ? 'newest' : undefined,
      });
      setData(result);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load(section, sort);
  }, [section, sort, load]);

  // Reset pagination when the filter or sort changes.
  useEffect(() => {
    setVisible(12);
  }, [section, sort]);

  // Auto-refresh: poll health; when a crawl finishes (manual, scheduled, or the
  // Windows task), reload the stories automatically.
  useEffect(() => {
    let lastSeen: string | null | undefined;
    const timer = setInterval(async () => {
      try {
        const h = await fetchHealth();
        if (!h.last_updated) return;
        if (lastSeen === undefined) {
          lastSeen = h.last_updated;
        } else if (h.last_updated !== lastSeen) {
          lastSeen = h.last_updated;
          await load(section, sort);
        }
      } catch {
        // ignore polling errors
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [section, sort, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await triggerRefresh();
      // The crawl runs in the background; poll until it finishes (max ~90s).
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const health = await fetchHealth();
        if (!health.refreshing) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
      await load(section, sort);
    }
  }, [section, sort, load]);

  const mood = computeMood(data?.clusters ?? [], data?.stale ?? false);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Header
        lastUpdated={data?.last_updated ?? null}
        stale={data?.stale ?? false}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
      <FloatingPet mood={mood} refreshing={refreshing} onRefresh={onRefresh} />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['all', 'world', 'politics'] as SectionFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`rounded-full border px-3 py-1 text-sm capitalize ${
                section === s
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-white text-ink hover:border-ink'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setSort('coverage')}
            className={`rounded border px-3 py-1 ${sort === 'coverage' ? 'border-ink bg-ink text-paper' : 'border-line bg-white'}`}
          >
            Cross-outlet coverage
          </button>
          <button
            onClick={() => setSort('newest')}
            className={`rounded border px-3 py-1 ${sort === 'newest' ? 'border-ink bg-ink text-paper' : 'border-line bg-white'}`}
          >
            Newest
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-red-800">
          Could not load stories: {error}
        </div>
      )}

      {!data && !error && (
        <div className="mt-16 text-center text-muted">Loading top stories…</div>
      )}

      {data && data.clusters.length === 0 && (
        <div className="mt-16 text-center text-muted">
          No stories yet. Run <code className="rounded bg-stone-100 px-1">npm run seed</code> or press Refresh.
        </div>
      )}

      {data && data.clusters.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.clusters.slice(0, visible).map((c) => (
              <StoryCard key={c.id} cluster={c} />
            ))}
          </div>
          {(data.clusters.length > visible || visible > 12) && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {visible > 12 && (
                <button
                  onClick={() => setVisible(12)}
                  className="rounded border border-ink px-5 py-2 text-sm font-medium text-ink hover:bg-stone-100"
                >
                  Show less
                </button>
              )}
              {data.clusters.length > visible && (
                <button
                  onClick={() => setVisible((v) => v + 24)}
                  className="rounded border border-ink bg-ink px-5 py-2 text-sm font-medium text-paper hover:bg-stone-800"
                >
                  View more stories ({data.clusters.length - visible} more)
                </button>
              )}
            </div>
          )}
        </>
      )}

      {data && data.singles.length > 0 && (
        <section className="mt-12">
          <div className="newspaper-rule px-1 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-bold">Single-source reports</h2>
              <Link to="/singles" className="text-sm font-medium text-accent underline hover:text-ink">
                See all ({data.singles.length}) →
              </Link>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted">
            Reported by only one outlet so far — less corroborated. These move to the main list once a
            second source covers the same story.
          </p>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {data.singles.slice(0, 10).map((a) => (
              <Link
                key={a.id}
                to={`/single/${a.id}`}
                className="min-w-[260px] max-w-[260px] shrink-0 overflow-hidden rounded border border-line bg-white transition hover:shadow-md"
              >
                <div className="aspect-[16/9] w-full">
                  <NewsImage src={a.image_url} alt={a.headline} />
                </div>
                <div className="p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
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
                    <span>{formatRelative(a.published_at)}</span>
                  </div>
                  <p className="mt-2 font-serif text-sm font-semibold leading-snug">{a.headline}</p>
                  <p className="mt-1 text-xs text-muted line-clamp-2">{a.summary}</p>
                  <SentimentStrip articles={[a]} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
