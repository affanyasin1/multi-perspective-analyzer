import { Link } from 'react-router-dom';
import { formatDateTime } from '../utils';

interface Props {
  lastUpdated: string | null;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

export default function Header({ lastUpdated, stale, refreshing, onRefresh }: Props) {
  return (
    <header className="border-b-4 border-double border-ink pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Same Story, Different Lens
          </h1>
          <p className="mt-1 font-serif italic text-xl text-muted">One event. Many tellings.</p>
        </div>
        <div className="text-right text-sm text-muted">
          <div>
            Last synced{' '}
            <span className="font-semibold text-ink" title={lastUpdated ? new Date(lastUpdated).toLocaleString() : undefined}>
              {lastUpdated ? `~${formatDateTime(lastUpdated)}` : '—'}
            </span>
          </div>
          {stale && (
            <div className="mt-1 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
              Feed unreachable — showing last good data
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Analysis explains itself — click any story to see the evidence.
        </p>
        <div className="flex items-center gap-2">
          <Link
            to="/outlets"
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper"
          >
            Outlets
          </Link>
          <Link
            to="/newsroom"
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper"
          >
            Newsroom
          </Link>
          <Link
            to="/insights"
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper"
          >
            Insights
          </Link>
          <Link
            to="/evaluation"
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper"
          >
            Evaluation
          </Link>
          <Link
            to="/dashboard"
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper"
          >
            Dashboard
          </Link>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded border border-ink px-3 py-1.5 text-sm font-medium hover:bg-ink hover:text-paper disabled:opacity-50"
          >
            {refreshing ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>
    </header>
  );
}
