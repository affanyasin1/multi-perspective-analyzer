import type { Outlet } from './types';

// Approximate IANA timezone per outlet (their editorial HQ), used only for the
// "posting cadence" bucketing. RSS published_at is usually UTC, so we shift it
// to the outlet's local time for a more meaningful hour/day distribution.
export const OUTLET_TIMEZONES: Record<Outlet, string> = {
  skynews: 'Europe/London',
  france24: 'Europe/Paris',
  npr: 'America/New_York',
  indianexpress: 'Asia/Kolkata',
  irna: 'Asia/Tehran',
  mehrnews: 'Asia/Tehran',
  thenews: 'Asia/Karachi',
  dohanews: 'Asia/Qatar',
  almonitor: 'America/New_York',
  thenational: 'Asia/Dubai',
  yonhap: 'Asia/Seoul',
  anadolu: 'Europe/Istanbul',
  dailynewsegypt: 'Africa/Cairo',
  allafrica: 'Africa/Nairobi',
  tass: 'Europe/Moscow',
  globaltimes: 'Asia/Shanghai',
  ecns: 'Asia/Shanghai',
};

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Local hour (0-23) and weekday index (0=Sun) for an ISO timestamp in a timezone.
export function localParts(iso: string, tz: string): { hour: number; weekday: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(d);
    let hour = 0;
    let weekday = 0;
    for (const p of parts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10) % 24;
      if (p.type === 'weekday') weekday = WD.indexOf(p.value);
    }
    return { hour, weekday };
  } catch {
    return null;
  }
}
