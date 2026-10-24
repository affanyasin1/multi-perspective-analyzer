import type { Article, Outlet, SentimentLabel } from '../types';
import { OUTLET_NAMES, OUTLET_ORDER, OUTLET_SHORT } from '../types';
import { OUTLET_COLORS } from '../utils';

interface Props {
  articles: Article[];
}

function labelFor(score: number): SentimentLabel {
  if (score <= -0.6) return 'negative';
  if (score <= -0.2) return 'lean-negative';
  if (score < 0.2) return 'neutral';
  if (score < 0.6) return 'lean-positive';
  return 'positive';
}

// One dot per OUTLET, colored by that outlet's brand color. Horizontal position
// is that outlet's average sentiment for this story, from −1 (negative) to
// +1 (positive). A legend maps each color back to its outlet.
export default function SentimentStrip({ articles }: Props) {
  const analyzed = articles.filter((a) => a.analysis);
  if (analyzed.length === 0) return null;

  const byOutlet = new Map<Outlet, number[]>();
  for (const a of analyzed) {
    const scores = byOutlet.get(a.outlet) ?? [];
    scores.push(a.analysis!.sentiment.score);
    byOutlet.set(a.outlet, scores);
  }
  const outlets = OUTLET_ORDER.filter((o) => byOutlet.has(o));

  // Outlets with (nearly) identical sentiment would draw their dots on top of
  // each other, hiding all but one. Stack overlapping dots vertically so every
  // outlet stays visible at its true horizontal (sentiment) position.
  const dots = outlets.map((outlet) => {
    const scores = byOutlet.get(outlet)!;
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
    const pct = ((avg + 1) / 2) * 100;
    return { outlet, avg, pct, key: Math.round(pct * 10) / 10 };
  });
  const buckets = new Map<number, typeof dots>();
  for (const d of dots) {
    const arr = buckets.get(d.key) ?? [];
    arr.push(d);
    buckets.set(d.key, arr);
  }
  const dotByOutlet = new Map(dots.map((d) => [d.outlet, d]));

  return (
    <div className="mt-3">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500 via-stone-300 to-green-600">
        {outlets.map((outlet) => {
          const d = dotByOutlet.get(outlet)!;
          const bucket = buckets.get(d.key)!;
          const idx = bucket.findIndex((x) => x.outlet === outlet);
          const offset = bucket.length > 1 ? (idx - (bucket.length - 1) / 2) * 12 : 0;
          return (
            <span
              key={outlet}
              title={`${OUTLET_NAMES[outlet]}: ${d.avg >= 0 ? '+' : ''}${d.avg.toFixed(2)} (${labelFor(d.avg)})`}
              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{
                left: `${d.pct}%`,
                top: `calc(50% + ${offset}px)`,
                backgroundColor: OUTLET_COLORS[outlet],
              }}
            />
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
        <span>negative</span>
        <span>neutral</span>
        <span>positive</span>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
        {outlets.map((outlet) => (
          <span key={outlet} className="inline-flex items-center gap-1 text-[10px] leading-none text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: OUTLET_COLORS[outlet] }} />
            {OUTLET_SHORT[outlet]}
          </span>
        ))}
      </div>
    </div>
  );
}
