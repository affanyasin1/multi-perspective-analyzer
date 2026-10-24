import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Chameleon, { type ChameleonMood } from './Chameleon';

type Corner = 'br' | 'bl' | 'tr' | 'tl';

interface Props {
  mood: ChameleonMood;
  refreshing: boolean;
  onRefresh: () => void;
}

const CORNER_STYLE: Record<Corner, CSSProperties> = {
  br: { right: 16, bottom: 16 },
  bl: { left: 16, bottom: 16 },
  tr: { right: 16, top: 16 },
  tl: { left: 16, top: 16 },
};

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function nearestCorner(x: number, y: number): Corner {
  const horiz = x < window.innerWidth / 2 ? 'l' : 'r';
  const vert = y < window.innerHeight / 2 ? 't' : 'b';
  return (vert + horiz) as Corner;
}

export default function FloatingPet({ mood, refreshing, onRefresh }: Props) {
  const [hidden, setHidden] = useState(() => load('pet-hidden', false));
  const [corner, setCorner] = useState<Corner>(() => load('pet-corner-v2', 'tr'));
  const [tucked, setTucked] = useState(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => save('pet-hidden', hidden), [hidden]);
  useEffect(() => save('pet-corner-v2', corner), [corner]);

  // Tuck away while scrolling down; pop back on scroll up or after a pause.
  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (delta > 6) setTucked(true);
        else if (delta < -6) setTucked(false);
        lastY = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!tucked) return;
    const t = setTimeout(() => setTucked(false), 2500);
    return () => clearTimeout(t);
  }, [tucked]);

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="fixed z-50 rounded-full border border-ink bg-white px-3 py-1 text-xs text-ink shadow hover:bg-stone-100"
        style={CORNER_STYLE[corner]}
        title="Bring back the news pet"
      >
        🦎 bring back the pet
      </button>
    );
  }

  return (
    <div className={`fixed z-50 ${tucked ? 'pet-tucked' : ''}`} style={CORNER_STYLE[corner]}>
      <div className="group relative">
        <div
          className={`pointer-events-none absolute right-0 z-20 w-64 rounded border border-line bg-white p-3 text-xs leading-relaxed text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${
            corner.startsWith('t') ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          <div className="font-semibold">The news chameleon</div>
          <p className="mt-1 text-muted">
            It colors itself by the dominant bias lean of today's multi-source coverage, and reacts to the data's health.
          </p>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#2563eb' }} />
              blue — lean-left
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#dc2626' }} />
              red — lean-right
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#16a34a' }} />
              green — center / neutral
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#a8a29e' }} />
              gray — sleeping (data stale)
            </li>
          </ul>
          <p className="mt-2 text-muted">Squinting = divergent coverage · click = refresh · drag = move · × = hide.</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setHidden(true);
          }}
          className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-xs leading-none text-stone-600 hover:bg-stone-300"
          title="Hide the pet"
        >
          ×
        </button>
        <div
          className={`cursor-grab touch-none ${refreshing ? 'pet-busy' : ''}`}
          style={{
            transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
            transition: drag ? 'none' : 'transform 0.2s ease',
          }}
          title="Click to refresh · drag to move · × to hide"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
            setDrag({ dx: 0, dy: 0 });
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
            setDrag({ dx, dy });
          }}
          onPointerUp={(e) => {
            const d = dragRef.current;
            if (!d) return;
            const moved = d.moved;
            dragRef.current = null;
            setDrag(null);
            if (moved) setCorner(nearestCorner(e.clientX, e.clientY));
            else onRefresh();
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setDrag(null);
          }}
        >
          <Chameleon mood={mood} />
        </div>
      </div>
    </div>
  );
}
