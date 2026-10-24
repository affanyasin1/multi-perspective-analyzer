import type { Cluster } from '../types';

export interface ChameleonMood {
  color: string; // body color reflects the dominant bias lean
  squint: boolean; // coverage is highly divergent
  sleepy: boolean; // data is stale
}

function leanOf(rating: string): number {
  switch (rating) {
    case 'left':
      return -1;
    case 'lean-left':
      return -0.5;
    case 'lean-right':
      return 0.5;
    case 'right':
      return 1;
    default:
      return 0;
  }
}

// Derive the mascot's mood from the current clusters: body color = dominant
// bias lean (blue = left, red = right, green = center), squint = high sentiment
// divergence, sleep = stale data.
export function computeMood(clusters: Cluster[], stale: boolean): ChameleonMood {
  const articles = clusters.flatMap((c) => c.articles).filter((a) => a.analysis);
  if (stale) return { color: '#a8a29e', squint: false, sleepy: true };
  if (articles.length === 0) return { color: '#78716c', squint: false, sleepy: false };

  const meanLean = articles.reduce((s, a) => s + leanOf(a.analysis!.bias_rating.rating), 0) / articles.length;
  const meanSent = articles.reduce((s, a) => s + a.analysis!.sentiment.score, 0) / articles.length;
  const variance = articles.reduce((s, a) => s + (a.analysis!.sentiment.score - meanSent) ** 2, 0) / articles.length;

  return {
    color: meanLean < -0.15 ? '#2563eb' : meanLean > 0.15 ? '#dc2626' : '#16a34a',
    squint: Math.sqrt(variance) > 0.55,
    sleepy: false,
  };
}

export default function Chameleon({ mood }: { mood: ChameleonMood }) {
  const lidStyle = mood.sleepy
    ? { transform: 'scaleY(1)', transformBox: 'fill-box' as const, transformOrigin: 'center' as const }
    : mood.squint
      ? { transform: 'scaleY(0.55)', transformBox: 'fill-box' as const, transformOrigin: 'center' as const }
      : undefined;

  const label = mood.sleepy
    ? 'News mascot sleeping — data is stale'
    : mood.squint
      ? 'News mascot squinting — coverage is divergent'
      : 'News mascot — colored by the dominant bias of today\u2019s coverage';

  return (
    <svg viewBox="0 0 90 50" width="84" height="47" aria-label={label} role="img" className="shrink-0">
      <title>{label}</title>
      {/* curled tail */}
      <path
        d="M72 34 C 82 34, 84 24, 76 20 C 70 17, 66 22, 70 26 C 73 29, 78 27, 77 23"
        fill="none"
        stroke={mood.color}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* body */}
      <ellipse cx="48" cy="32" rx="26" ry="15" fill={mood.color} />
      {/* legs */}
      <path d="M38 44 L 36 48 M 56 44 L 58 48" stroke={mood.color} strokeWidth="4" strokeLinecap="round" />
      {/* head */}
      <circle cx="20" cy="21" r="12" fill={mood.color} />
      {/* eye */}
      <circle cx="18" cy="17" r="6.5" fill="#ffffff" />
      <circle cx="18" cy="17" r="2.8" fill="#111827" />
      {/* eyelid (blinks, squints, or sleeps) */}
      {lidStyle ? (
        <circle cx="18" cy="17" r="6.5" fill={mood.color} style={lidStyle} />
      ) : (
        <circle className="chameleon-lid" cx="18" cy="17" r="6.5" fill={mood.color} />
      )}
    </svg>
  );
}
