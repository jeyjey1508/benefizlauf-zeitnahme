const pad = (n: number) => String(n).padStart(2, '0');

/** Sekunden als HH:MM:SS */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** "HH:MM:SS" oder "H:MM:SS" oder "MM:SS" → Sekunden */
export function parseDuration(raw: string): number | null {
  const parts = raw.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

/** Bruttozeit in vollen Sekunden (abgeschnitten, wie bei Zeitnahmen üblich) */
export const elapsedSeconds = (startIso: string, finishMs: number) =>
  Math.floor((finishMs - Date.parse(startIso)) / 1000);

export const clockTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Lokales Datum + Uhrzeit (HH:MM oder HH:MM:SS) → ISO */
export function localToIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!dm || !tm) return null;
  const [h, mi, s] = [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi, s).toISOString();
}

export const fileStamp = () => {
  const d = new Date();
  return `${toDateInput(d)}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};
