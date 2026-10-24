import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNewsroom, runNewsroom, type NewsroomData } from '../api';
import { formatRelative } from '../utils';

const AGENTS = [
  { id: 'analyst', name: 'Ava', role: 'Analyst', emoji: '🔍', color: '#2563eb', desc: 'Reads & scores every article.' },
  { id: 'critic', name: 'Cedric', role: 'Critic', emoji: '✍️', color: '#b98a2f', desc: 'Verifies every claim.' },
  { id: 'reporter', name: 'Rosie', role: 'Reporter', emoji: '📰', color: '#16a34a', desc: 'Writes the world briefing.' },
] as const;

type FaceState = 'idle' | 'working' | 'done' | 'sleeping';

function AgentFace({ color, state }: { color: string; state: FaceState }) {
  const lidClosed = state === 'sleeping';
  const lidStyle = lidClosed
    ? { transform: 'scaleY(1)', transformBox: 'fill-box' as const, transformOrigin: 'center' as const }
    : undefined;
  const animClass = state === 'working' ? 'agent-bob' : state === 'sleeping' ? 'agent-sleep' : 'agent-idle';

  return (
    <svg viewBox="0 0 80 80" className={`h-14 w-14 ${animClass}`} aria-hidden>
      <circle cx="40" cy="40" r="36" fill={color} />
      <circle cx="28" cy="34" r="8" fill="#ffffff" />
      <circle cx="52" cy="34" r="8" fill="#ffffff" />
      {state !== 'sleeping' && (
        <g className="agent-pupil">
          <circle cx="28" cy="34" r="3.5" fill="#1c1a17" />
          <circle cx="52" cy="34" r="3.5" fill="#1c1a17" />
        </g>
      )}
      <circle className={lidClosed ? undefined : 'agent-lid'} cx="28" cy="34" r="8" fill={color} style={lidStyle} />
      <circle className={lidClosed ? undefined : 'agent-lid'} cx="52" cy="34" r="8" fill={color} style={lidStyle} />
      {state === 'working' ? (
        <ellipse cx="40" cy="52" rx="4" ry="6" fill="#1c1a17" />
      ) : state === 'done' ? (
        <path d="M32 50 Q40 60 48 50" stroke="#1c1a17" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : state === 'sleeping' ? (
        <path d="M34 53 Q40 56 46 53" stroke="#1c1a17" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : (
        <line x1="34" y1="52" x2="46" y2="52" stroke="#1c1a17" strokeWidth="3" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function Newsroom() {
  const [data, setData] = useState<NewsroomData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bubble, setBubble] = useState<{ agentId: string; text: string } | null>(null);
  const [sleepy, setSleepy] = useState(false);

  const load = () => fetchNewsroom().then(setData).catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  // Idle chatter: periodically pop a speech bubble over a random agent.
  useEffect(() => {
    const lines: Record<string, string[]> = {
      analyst: [
        'Reading the wires…', 'Scoring the latest…', 'Tracking the feed.',
        'Framing the angles…', 'Sifting fact from spin.', 'This headline leans hard.',
        'Comparing lead sentences…', 'Who got the byline right?', 'Sentiment is shifting…',
      ],
      critic: [
        'Checking quotes…', 'All claims grounded ✓', 'No unsupported framing.',
        'Cross-checking omissions…', 'That quote checks out.', 'Hmm, vague attribution…',
        'Fact vs opinion: 60/40.', 'Flagging a loaded phrase.', 'Evidence is thin here.',
      ],
      reporter: [
        'Drafting the briefing…', 'Watching for divergence…', 'Briefing due soon.',
        'Synthesizing the day…', 'Squaring the angles…', 'The spectrum is wide today.',
        'Restrained vs charged…', 'Tying it together…', 'Headline coming together…',
      ],
    };
    const ids = Object.keys(lines);
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      const id = ids[Math.floor(Math.random() * ids.length)];
      const pool = lines[id];
      const text = pool[Math.floor(Math.random() * pool.length)];
      setBubble({ agentId: id, text });
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setBubble(null), 2600);
    }, 5200);
    return () => {
      clearInterval(timer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // Agents doze off after ~20s of no work.
  useEffect(() => {
    if (!data) return;
    if (data.crawling || data.briefing_running) {
      setSleepy(false);
      return;
    }
    const t = setTimeout(() => setSleepy(true), 20000);
    return () => clearTimeout(t);
  }, [data?.crawling, data?.briefing_running, data?.activity?.[0]?.at]);

  const onRun = async () => {
    setGenerating(true);
    setSleepy(false);
    try {
      await runNewsroom();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const d = await fetchNewsroom();
        setData(d);
        if (!d.crawling && !d.briefing_running) break;
      }
      setData(await fetchNewsroom());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="text-red-700">Could not load the newsroom: {error}</p>
        <Link to="/" className="mt-4 inline-block text-accent underline">← Back to stories</Link>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-muted">Loading newsroom…</div>;
  }

  const b = data.briefing;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">Newsroom</h1>
          <p className="mt-1 text-sm text-muted">
            Three agents — Analyst, Critic, Reporter — turn raw coverage into a verified world briefing.
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">← Back</Link>
      </div>

      <section className="mt-6 rounded border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">World briefing</h2>
          <button
            onClick={onRun}
            disabled={generating}
            className="rounded border border-ink bg-ink px-4 py-1.5 text-sm font-medium text-paper hover:bg-stone-800 disabled:opacity-50"
          >
            {generating ? 'Running…' : 'Run the newsroom'}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Written by the Reporter agent from verified coverage · {b ? `generated ${formatRelative(b.generated_at)}` : 'not yet generated'} · every {data.interval_hours}h
        </p>

        {b ? (
          <div className="mt-4">
            <h3 className="font-serif text-2xl font-bold leading-tight">{b.headline}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink">{b.summary}</p>
            {b.divergences.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {b.divergences.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted"><span>•</span><span>{d}</span></li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm">
              <span className="font-semibold">What it means: </span>
              <span className="text-muted">{b.implications}</span>
            </p>
            <p className="mt-3 text-[11px] text-muted">agent: reporter · provider: {b.provider} · model: {b.model || '—'}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            No briefing yet — click “Generate now”, or it will be written automatically on the {data.interval_hours}-hour cycle.
          </p>
        )}
      </section>

      <section className="mt-6 rounded border-2 border-dashed border-line bg-stone-50 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">The Newsroom</h2>
          <span className="text-xs font-medium text-muted">
            {data.crawling || data.briefing_running ? '● Working…' : sleepy ? '● Sleeping…' : '● At play'}
          </span>
        </div>

        <div className="mt-5 flex items-end justify-around gap-4">
          {AGENTS.map((ag, i) => {
            const working = ag.id === 'reporter' ? data.briefing_running : data.crawling;
            const last = data.activity.find((a) => a.agent === ag.id);
            const state: FaceState = working ? 'working' : sleepy ? 'sleeping' : last ? 'done' : 'idle';
            return (
              <div key={ag.id} className={`flex flex-col items-center gap-2 ${working || sleepy ? '' : `agent-wander-${i + 1}`}`}>
                <div className="relative">
                  <AgentFace color={ag.color} state={state} />
                  {bubble?.agentId === ag.id && !working && !sleepy && (
                    <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-white px-2 py-1 text-[11px] text-ink shadow-sm">
                      {bubble.text}
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold">
                    {ag.name} <span className="font-normal text-muted">· {ag.role}</span>
                  </div>
                  <div className="text-[11px] text-muted">
                    {working ? 'Working…' : sleepy ? 'zzz…' : last ? last.action : ag.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-sm">
          <span className="font-semibold">Verification rate: </span>
          {data.verification_rate != null
            ? `${data.verification_rate} (${data.total_verified} articles)`
            : '— (run a Sync to populate)'}
        </p>

        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Activity</h3>
          {data.activity.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No activity yet — run a Sync or generate the briefing.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {data.activity.map((a, i) => {
                const ag = AGENTS.find((g) => g.id === a.agent);
                return (
                  <li key={i} className="flex items-center gap-2 text-xs text-muted">
                    <span>{ag?.emoji}</span>
                    <span className="font-medium text-ink">{ag?.name}</span>
                    <span>{a.action}</span>
                    <span className="ml-auto shrink-0">{formatRelative(a.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
