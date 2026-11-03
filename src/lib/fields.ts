import type { Discipline, Distance, FieldId, Participant } from './types';

export interface FieldDef {
  id: FieldId;
  distance: Distance;
  discipline: Discipline;
  label: string;
  short: string;
}

export const FIELDS: FieldDef[] = [
  { id: '3.0-Lauf', distance: '3.0', discipline: 'Lauf', label: '3,0 km Lauf', short: '3,0 Lauf' },
  { id: '3.0-Walk', distance: '3.0', discipline: 'Walk', label: '3,0 km Walk', short: '3,0 Walk' },
  { id: '5.7-Lauf', distance: '5.7', discipline: 'Lauf', label: '5,7 km Lauf', short: '5,7 Lauf' },
  { id: '5.7-Walk', distance: '5.7', discipline: 'Walk', label: '5,7 km Walk', short: '5,7 Walk' },
];

export const fieldOf = (p: Pick<Participant, 'distance' | 'discipline'>): FieldId =>
  `${p.distance}-${p.discipline}` as FieldId;

export const fieldLabel = (id: FieldId) => FIELDS.find((f) => f.id === id)!.label;

export function parseDistance(raw: string): Distance | null {
  const v = raw.trim().toLowerCase().replace(/\s*km$/, '').replace(',', '.');
  if (v === '3' || v === '3.0') return '3.0';
  if (v === '5.7') return '5.7';
  return null;
}

export function parseDiscipline(raw: string): Discipline | null {
  const v = raw.trim().toLowerCase();
  if (v === 'lauf') return 'Lauf';
  if (v === 'walk') return 'Walk';
  return null;
}

/** Startnummer normalisieren: nur Ziffern, ohne führende Nullen. */
export function normalizeBib(raw: string): string | null {
  const v = raw.trim();
  if (!/^\d{1,6}$/.test(v)) return null;
  return String(parseInt(v, 10));
}

export const fullName = (p: Participant) => `${p.firstName} ${p.lastName}`.trim();
