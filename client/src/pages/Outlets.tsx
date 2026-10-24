import { Link } from 'react-router-dom';
import { OUTLET_META } from '../outlets';
import { OUTLET_NAMES, OUTLET_ORDER } from '../types';
import { OUTLET_COLORS } from '../utils';

export default function Outlets() {
  const outlets = [...OUTLET_ORDER].sort((a, b) => OUTLET_NAMES[a].localeCompare(OUTLET_NAMES[b]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold">News outlets in this project</h1>
          <p className="mt-1 text-sm text-muted">
            The {outlets.length} sources crawled and compared. Lean labels are approximate reference
            points, not absolute judgments.
          </p>
        </div>
        <Link to="/" className="text-sm font-medium text-accent underline hover:text-ink">
          ← Back to stories
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-line bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-stone-50 text-left">
              <th className="px-3 py-2.5 font-semibold">Outlet</th>
              <th className="px-3 py-2.5 font-semibold">Country</th>
              <th className="px-3 py-2.5 font-semibold">Ownership</th>
              <th className="px-3 py-2.5 font-semibold">Lean</th>
              <th className="px-3 py-2.5 font-semibold">Site</th>
            </tr>
          </thead>
          <tbody>
            {outlets.map((o) => {
              const m = OUTLET_META[o];
              const state = m.lean.toLowerCase().startsWith('state') || m.lean.toLowerCase().startsWith('pro-gov');
              return (
                <tr key={o} className="border-b border-line last:border-0 hover:bg-stone-50/60">
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OUTLET_COLORS[o] }} />
                      <span className="font-medium">{OUTLET_NAMES[o]}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{m.country}</td>
                  <td className="px-3 py-2.5 text-muted">{m.ownership}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        state ? 'bg-stone-100 text-stone-700' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {m.lean}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline hover:text-ink"
                    >
                      {m.url.replace(/^https?:\/\//, '')} ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold">What does "lean" mean?</h2>
        <p className="mt-2 text-sm text-muted">
          "Lean" is a rough, human-assigned label for an outlet's general editorial posture — the direction
          its framing tends to tilt on average, <em>not</em> a verdict on any single article. It comes from
          public media-bias references (Media Bias/Fact Check style), not from this app's LLM.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li><strong className="text-ink">Center</strong> — straight news reporting with little consistent tilt in either direction.</li>
          <li><strong className="text-ink">Left-Center</strong> — on average frames stories with a slightly progressive slant.</li>
          <li><strong className="text-ink">Right-Center</strong> — on average frames stories with a slightly conservative slant (none of the current outlets use this label).</li>
          <li><strong className="text-ink">Pro-gov (center)</strong> — privately owned but editorially aligned with the state; moderate in tone.</li>
          <li><strong className="text-ink">State (pro-gov)</strong> — government-owned or controlled; frames in favour of the ruling government.</li>
        </ul>
      </section>

      <section className="mt-8 rounded border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        <p className="font-semibold">Beta version — mistakes can happen.</p>
        <p className="mt-1">
          This is an automated, early-stage research tool. Bias, sentiment, framing, and the lean labels above
          are all approximate and can be wrong. The lean labels are editorial reference values, and the
          per-article analysis is produced by an LLM (or mock values when no API key is set). Do not treat any
          of it as fact — verify against the original article before citing or sharing.
        </p>
      </section>
    </div>
  );
}
