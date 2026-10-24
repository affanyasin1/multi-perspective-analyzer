import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchStory } from '../api';
import AnalysisTabs from '../components/AnalysisTabs';
import NewsImage from '../components/NewsImage';
import type { Cluster } from '../types';
import { OUTLET_NAMES, OUTLET_ORDER } from '../types';
import { OUTLET_COLORS, formatDateTime, formatRelative, pickClusterImage, sentimentLabelClass } from '../utils';

function SourceCell({ cluster, outlet }: { cluster: Cluster; outlet: string }) {
  const [showBody, setShowBody] = useState(false);
  const article = cluster.articles.find((a) => a.outlet === outlet);
  if (!article) return null;
  return (
    <div className="flex flex-col border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="font-serif text-lg font-semibold" style={{ color: OUTLET_COLORS[article.outlet] }}>
          {OUTLET_NAMES[article.outlet]}
        </span>
        {article.analysis && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sentimentLabelClass(article.analysis.sentiment.label)}`}>
            {article.analysis.sentiment.label}
          </span>
        )}
      </div>
      <h3 className="mt-2 font-serif text-base font-semibold leading-snug">{article.headline}</h3>
      <p className="mt-2 flex-1 text-sm text-muted line-clamp-5">{article.summary}</p>
      {article.body_text && article.body_text.length > 40 && (
        <div className="mt-2">
          {!showBody ? (
            <button
              onClick={() => setShowBody(true)}
              className="inline-flex items-center gap-1 rounded border border-line bg-stone-50 px-2.5 py-1 text-xs font-medium text-accent hover:border-ink hover:text-ink"
            >
              Read full text ▾
            </button>
          ) : (
            <div className="rounded border border-line bg-stone-50/60">
              <div className="max-h-64 overflow-y-auto p-3">
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{article.body_text}</p>
              </div>
              <button
                onClick={() => setShowBody(false)}
                className="inline-flex w-full items-center justify-center gap-1 border-t border-line px-2 py-1.5 text-xs font-medium text-muted hover:bg-stone-100 hover:text-ink"
              >
                Hide full text ▴
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{formatRelative(article.published_at)} · {formatDateTime(article.published_at)}</span>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            window.open(article.url, '_blank', 'noopener,noreferrer');
          }}
          className="font-medium text-accent underline hover:text-ink"
        >
          Read at {OUTLET_NAMES[article.outlet]} ↗
        </a>
      </div>
    </div>
  );
}

export default function Story() {
  const { id } = useParams<{ id: string }>();
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchStory(id)
      .then((res) => {
        if (!cancelled) setCluster(res.cluster);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load story: {error}</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">
          ← Back to all stories
        </Link>
      </div>
    );
  }

  if (!cluster) {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-muted">Loading story…</div>;
  }

  const image = pickClusterImage(cluster);
  const outlets = OUTLET_ORDER.filter((o) => cluster.articles.some((a) => a.outlet === o));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">
        ← Back to all stories
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="rounded bg-stone-100 px-1.5 py-0.5 uppercase tracking-wide">{cluster.section}</span>
          <span>Last updated {formatRelative(cluster.updated_at)}</span>
          <span className="opacity-70">· {formatDateTime(cluster.updated_at)}</span>
        </div>
        <h1 className="mt-2 font-serif text-3xl font-bold leading-tight sm:text-4xl">{cluster.topic_label}</h1>
      </header>

      <div className="mt-4 aspect-[21/9] w-full overflow-hidden border border-line">
        <NewsImage src={image} alt={cluster.topic_label} />
      </div>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">How each outlet told it</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {outlets.map((o) => (
            <SourceCell key={o} cluster={cluster} outlet={o} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">Story timeline</h2>
        <p className="mt-1 text-xs text-muted">
          How this story developed — {cluster.articles.length} articles matched over time.
        </p>
        <ol className="mt-4 space-y-3 border-l-2 border-line pl-4">
          {[...cluster.articles]
            .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
            .map((a) => (
              <li key={a.url} className="relative">
                <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span
                    className="rounded px-1.5 py-0.5 font-medium"
                    style={{ backgroundColor: `${OUTLET_COLORS[a.outlet]}1a`, color: OUTLET_COLORS[a.outlet] }}
                  >
                    {OUTLET_NAMES[a.outlet]}
                  </span>
                  <span>{formatDateTime(a.published_at)}</span>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block font-serif text-sm font-semibold hover:underline"
                >
                  {a.headline}
                </a>
              </li>
            ))}
        </ol>
      </section>

      <AnalysisTabs cluster={cluster} />
    </div>
  );
}
