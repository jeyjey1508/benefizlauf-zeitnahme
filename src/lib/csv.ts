import type { Participant } from './types';
import { normalizeBib, parseDiscipline, parseDistance } from './fields';

/** CSV parsen (Trennzeichen ; oder , wird an der Kopfzeile erkannt, Anführungszeichen erlaubt) */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const esc = (v: string | number) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV mit Semikolon und BOM – öffnet sich in deutschem Excel direkt richtig */
export const toCsv = (rows: (string | number)[][]) => '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');

export const REQUIRED_COLUMNS = ['startnummer', 'vorname', 'nachname', 'strecke', 'disziplin', 'team'] as const;

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportResult {
  participants: Participant[];
  errors: ImportIssue[];
  warnings: string[];
  fatal?: string;
}

/** Teilnehmer-CSV prüfen. existingBibs: Startnummern, die schon vergeben sind (beim Ergänzen). */
export function parseParticipantsCsv(text: string, existingBibs: Set<string>): ImportResult {
  const rows = parseCsv(text);
  const result: ImportResult = { participants: [], errors: [], warnings: [] };
  if (rows.length === 0) return { ...result, fatal: 'Die Datei ist leer.' };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => c !== 'team' && !header.includes(c));
  if (missing.length) return { ...result, fatal: `Folgende Spalten fehlen: ${missing.join(', ')}.` };
  const col = (name: string) => header.indexOf(name);

  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
    const bib = normalizeBib(get('startnummer'));
    const distance = parseDistance(get('strecke'));
    const discipline = parseDiscipline(get('disziplin'));
    const firstName = get('vorname');
    const lastName = get('nachname');

    if (!bib) return result.errors.push({ line, message: `Ungültige Startnummer "${get('startnummer')}"` });
    if (seen.has(bib) || existingBibs.has(bib))
      return result.errors.push({ line, message: `Startnummer ${bib} ist doppelt` });
    if (!firstName && !lastName) return result.errors.push({ line, message: 'Name fehlt' });
    if (!distance) return result.errors.push({ line, message: `Strecke "${get('strecke')}" – erlaubt sind 3.0 oder 5.7` });
    if (!discipline)
      return result.errors.push({ line, message: `Disziplin "${get('disziplin')}" – erlaubt sind Lauf oder Walk` });

    seen.add(bib);
    result.participants.push({ bib, firstName, lastName, distance, discipline, team: get('team'), status: 'auto' });
  });

  const teamSizes = new Map<string, number>();
  result.participants.forEach((p) => {
    if (p.team) teamSizes.set(p.team, (teamSizes.get(p.team) ?? 0) + 1);
  });
  teamSizes.forEach((n, team) => {
    if (n > 5) result.warnings.push(`Team "${team}" hat ${n} Personen (erlaubt sind höchstens 5).`);
  });
  return result;
}

export const SAMPLE_CSV = toCsv([
  [...REQUIRED_COLUMNS],
  ['101', 'Lena', 'Hoffmann', '3.0', 'Lauf', 'Klasse 7b'],
  ['102', 'Jonas', 'Becker', '3.0', 'Lauf', 'Klasse 7b'],
  ['103', 'Mia', 'Schröder', '3.0', 'Lauf', 'Klasse 7b'],
  ['104', 'Paul', 'Wagner', '3.0', 'Lauf', ''],
  ['201', 'Emma', 'Krüger', '3.0', 'Walk', 'Elternrat'],
  ['202', 'Sabine', 'Meyer', '3.0', 'Walk', 'Elternrat'],
  ['203', 'Thomas', 'Lange', '3.0', 'Walk', ''],
  ['301', 'Noah', 'Fischer', '5.7', 'Lauf', 'Lehrerteam'],
  ['302', 'Anna', 'Weber', '5.7', 'Lauf', 'Lehrerteam'],
  ['303', 'Felix', 'Schulz', '5.7', 'Lauf', 'Lehrerteam'],
  ['304', 'Sophie', 'Neumann', '5.7', 'Lauf', ''],
  ['401', 'Karin', 'Brandt', '5.7', 'Walk', ''],
]);
