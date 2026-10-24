import { useEffect, useState } from 'react';
import { fetchReliability, type OutletReliability } from '../api';

function colorFor(label: string): string {
  if (label === 'High') return '#1a7f37';
  if (label === 'Medium') return '#b98a2f';
  if (label === 'Low') return '#c62828';
  return '#a8a29e';
}

export default function ReliabilitySection() {
  const [outlets, setOutlets] = useState<OutletReliability[] | null>(null);

  useEffect(() => {
    fetchReliability()
      .then((r) => setOutlets(r.outlets))
      .catch(() => setOutlets([]));
  }, []);

  if (!outlets || outlets.length === 0) return null;

  return (
    <div className="mt-6 rounded border border-line bg-white p-4">
      <h2 className="font-serif text-lg font-semibold">Source corroboration</h2>
      <p className="mb-3 text-xs text-muted">
        How often each outlet's reporting was independently covered by another outlet. A proxy for
        corroboration — not a truthfulness verdict.
      </p>
      <div className="space-y-2">
        {outlets.map((o) => {
          const color = colorFor(o.label);
          return (
            <div key={o.outlet} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-sm font-medium">{o.outlet}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
                <div className="h-full" style={{ width: `${o.score}%`, backgroundColor: color }} />
              </div>
              <div className="w-44 shrink-0 text-right text-xs text-muted">
                {o.recent} recent · <span style={{ color }}>{o.label} ({o.score}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
