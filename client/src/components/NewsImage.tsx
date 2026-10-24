import { useState } from 'react';

interface Props {
  src: string | null;
  alt?: string;
}

// Local placeholder pool shown when an article has no image, or its image fails
// to load. Deterministic per article (seeded by src/headline) so a story keeps
// the same fallback on re-render.
const FALLBACKS = [
  '/fallback/breaking-news.svg',
  '/fallback/news-flash.svg',
  '/fallback/news-update.svg',
  '/fallback/developing-story.svg',
  '/fallback/latest-news.svg',
  '/fallback/news-alert.svg',
];

function pickFallback(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return FALLBACKS[(h >>> 0) % FALLBACKS.length];
}

// Renders the real image when available and loadable; otherwise a themed
// "Breaking News" placeholder from the local fallback pool.
export default function NewsImage({ src, alt = '' }: Props) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <img
      src={pickFallback(src ?? alt ?? 'news')}
      alt={alt || 'News'}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}
