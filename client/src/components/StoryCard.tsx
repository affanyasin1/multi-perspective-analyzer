import { Link } from 'react-router-dom';
import type { Cluster } from '../types';
import { OUTLET_NAMES } from '../types';
import { OUTLET_COLORS, formatDateTime, formatRelative, pickClusterImage } from '../utils';
import NewsImage from './NewsImage';
import SentimentStrip from './SentimentStrip';

interface Props {
  cluster: Cluster;
}

export default function StoryCard({ cluster }: Props) {
  // Prefer wire/broadcaster outlets' images first (their CDNs hotlink reliably).
  const image = pickClusterImage(cluster);
  const outlets = [...new Set(cluster.articles.map((a) => a.outlet))];

  return (
    <Link
      to={`/story/${cluster.id}`}
      className="group flex flex-col border border-line bg-white transition hover:shadow-md"
    >
      <div className="aspect-[16/9] w-full overflow-hidden border-b border-line">
        <NewsImage src={image} alt={cluster.topic_label} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <span className="rounded bg-stone-100 px-1.5 py-0.5 uppercase tracking-wide">{cluster.section}</span>
          {outlets.length >= 3 ? (
            <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-800">{outlets.length} sources</span>
          ) : (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">{outlets.length} sources</span>
          )}
          <span>{formatRelative(cluster.updated_at)}</span>
          <span className="opacity-70">· {formatDateTime(cluster.updated_at)}</span>
        </div>

        <h2 className="mt-2 font-serif text-xl font-semibold leading-snug group-hover:underline">
          {cluster.topic_label}
        </h2>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {outlets.map((o) => (
            <span
              key={o}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${OUTLET_COLORS[o]}1a`, color: OUTLET_COLORS[o] }}
            >
              {OUTLET_NAMES[o]}
            </span>
          ))}
        </div>

        <div className="mt-auto">
          <SentimentStrip articles={cluster.articles} />
        </div>
      </div>
    </Link>
  );
}
