import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchSingle } from '../api';
import NewsImage from '../components/NewsImage';
import type { SingleItem } from '../types';
import { OUTLET_NAMES } from '../types';
import { OUTLET_COLORS, biasColor, formatDateTime, formatRelative, sentimentLabelClass } from '../utils';

function FactOpinion({ factual, opinion }: { factual: number; opinion: number }) {
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

function LoadedLanguage({ quotes }: { quotes: { quote: string; explanation: string; neutral_alternative: string }[] }) {
  const [open, setOpen] = useState(false);
  if (quotes.length === 0) return <p className="text-sm text-muted">No loaded language flagged.</p>;
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
          {quotes.map((e, i) => (
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

export default function SingleDetail() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<SingleItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setShowFull(false);
    fetchSingle(id)
      .then((res) => {
        if (!cancelled) setArticle(res.article);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load report: {error}</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <Link to="/singles" className="text-accent underline">
            ← Back to single-source reports
          </Link>
          <Link to="/" className="text-accent underline">
            ← Home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">
        Fetching article & analysis…
      </div>
    );
  }

  if (!article) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">Report not found.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between text-sm">
        <Link to="/singles" className="font-medium text-accent underline hover:text-ink">
          ← Back to single-source reports
        </Link>
        <Link to="/" className="font-medium text-accent underline hover:text-ink">
          ← Home
        </Link>
      </div>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span
            className="rounded px-1.5 py-0.5 font-medium"
            style={{ backgroundColor: `${OUTLET_COLORS[article.outlet]}1a`, color: OUTLET_COLORS[article.outlet] }}
          >
            {OUTLET_NAMES[article.outlet]}
          </span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">Single source</span>
          {article.international && (
            <span
              className="rounded border border-blue-300 px-1.5 py-0.5 text-blue-600"
              title="International relevance — mentions 2+ countries or a major international body"
            >
              International focus
            </span>
          )}
          <span>{formatRelative(article.published_at)} · {formatDateTime(article.published_at)}</span>
        </div>
        <h1 className="mt-2 font-serif text-3xl font-bold leading-tight">{article.headline}</h1>
      </header>

      <div className="mt-4 aspect-[16/9] w-full overflow-hidden border border-line">
        <NewsImage src={article.image_url} alt={article.headline} />
      </div>

      <section className="mt-6">
        <h2 className="font-serif text-lg font-semibold">Summary</h2>
        <p className="mt-2 text-muted">{article.summary}</p>
        {article.body_text && (
          <div className="mt-6">
            <h2 className="font-serif text-lg font-semibold">Full text</h2>
            <p className={`mt-2 text-sm leading-relaxed ${showFull ? 'whitespace-pre-line' : 'line-clamp-5'}`}>
              {article.body_text}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowFull((v) => !v)}
                className="rounded border border-line px-2.5 py-1 text-xs font-medium text-accent hover:border-ink hover:text-ink"
              >
                {showFull ? 'Show less' : 'Show full text'}
              </button>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(article.url, '_blank', 'noopener,noreferrer');
                }}
                className="text-xs font-medium text-accent underline hover:text-ink"
              >
                Read at {OUTLET_NAMES[article.outlet]} ↗
              </a>
              {article.body_incomplete && (
                <span className="text-xs text-muted">Full text unavailable or paywalled — showing what could be retrieved.</span>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">Analysis</h2>
        {article.analysis ? (
          <div className="mt-3 space-y-3 border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sentimentLabelClass(article.analysis.sentiment.label)}`}>
                {article.analysis.sentiment.label} ({article.analysis.sentiment.score >= 0 ? '+' : ''}
                {article.analysis.sentiment.score.toFixed(2)})
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: biasColor(article.analysis.bias_rating.rating) }}
                />
                {article.analysis.bias_rating.rating} · {(article.analysis.bias_rating.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <p className="text-[11px] text-muted">
              Bias: left–right = progressive vs. conservative framing — a language-lean reading of this article.
            </p>
            <p className="text-muted">
              <span className="font-medium text-ink">Framing: </span>
              {article.analysis.framing}
            </p>
            <div className="flex flex-wrap gap-1">
              {article.analysis.tone_keywords.map((t) => (
                <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                  {t}
                </span>
              ))}
            </div>
            <FactOpinion factual={article.analysis.fact_vs_opinion.factual} opinion={article.analysis.fact_vs_opinion.opinion} />
            <LoadedLanguage quotes={article.analysis.loaded_language} />
            {article.analysis.omissions.length > 0 && (
              <div>
                <p className="font-medium text-ink">Possible omissions</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                  {article.analysis.omissions.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Analysis unavailable for this report.</p>
        )}
      </section>

      <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Single-source report — not yet corroborated by a second outlet. Bias ratings describe language
        patterns, not an absolute judgment of the outlet. Analysis generated by an LLM and evidence-quoted;
        verify before citing.
      </footer>
    </div>
  );
}
