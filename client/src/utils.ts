import type { Cluster, Outlet, SentimentLabel } from './types';

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleString('en-US', opts);
}

export function sentimentColor(label: SentimentLabel): string {
  switch (label) {
    case 'positive':
      return '#1a7f37';
    case 'lean-positive':
      return '#3fb05a';
    case 'negative':
      return '#c62828';
    case 'lean-negative':
      return '#e0762b';
    default:
      return '#8a8378';
  }
}

export function sentimentLabelClass(label: SentimentLabel): string {
  switch (label) {
    case 'positive':
      return 'bg-green-100 text-green-800';
    case 'lean-positive':
      return 'bg-green-50 text-green-700';
    case 'negative':
      return 'bg-red-100 text-red-800';
    case 'lean-negative':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

export function biasColor(rating: string): string {
  switch (rating) {
    case 'left':
      return '#1d4ed8';
    case 'lean-left':
      return '#60a5fa';
    case 'right':
      return '#b91c1c';
    case 'lean-right':
      return '#f87171';
    case 'center':
      return '#78716c';
    default:
      return '#a8a29e';
  }
}

export const OUTLET_COLORS: Record<Outlet, string> = {
  skynews: '#c8102e',
  france24: '#0067a5',
  npr: '#e07b39',
  indianexpress: '#00838f',
  irna: '#2e7d32',
  mehrnews: '#c2185b',
  thenews: '#6a1b9a',
  dohanews: '#5d4037',
  almonitor: '#1e88e5',
  thenational: '#8d6e63',
  yonhap: '#3949ab',
  anadolu: '#7cb342',
  dailynewsegypt: '#fb8c00',
  allafrica: '#00897b',
  tass: '#5e35b1',
  globaltimes: '#d81b60',
  ecns: '#546e7a',
};

// Pick a cluster's thumbnail from the article whose headline best matches the
// story's topic label (rather than blindly the first outlet), so a wrongly
// merged article doesn't supply an off-topic image.
export function pickClusterImage(cluster: Cluster): string | null {
  const withImage = cluster.articles.filter((a) => a.image_url);
  if (withImage.length === 0) return null;
  const topicTokens = new Set(
    cluster.topic_label.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  );
  let best = withImage[0];
  let bestScore = -1;
  for (const a of withImage) {
    const headTokens = a.headline.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    let score = 0;
    for (const t of headTokens) if (topicTokens.has(t)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best.image_url;
}
