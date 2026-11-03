import type { AppState, FieldId, Participant, ResultStatus, Scan } from './types';
import { FIELDS, fieldLabel, fieldOf, fullName } from './fields';
import { firstScans } from './store';
import { clockTime, elapsedSeconds, formatDuration } from './time';
import { toCsv } from './csv';

export interface ResultRow {
  participant: Participant;
  status: ResultStatus;
  scan?: Scan;
  elapsed?: number;
  place?: number;
}

export const STATUS_LABEL: Record<ResultStatus, string> = {
  gewertet: 'Gewertet',
  DNS: 'DNS',
  DNF: 'DNF',
  DSQ: 'Disq.',
};

export const STATUS_HINT: Record<ResultStatus, string> = {
  gewertet: 'Im Ziel gewertet',
  DNS: 'Nicht gestartet / nicht im Ziel erfasst',
  DNF: 'Gestartet, nicht ins Ziel gekommen',
  DSQ: 'Disqualifiziert',
};

const STATUS_ORDER: Record<ResultStatus, number> = { gewertet: 0, DNF: 1, DSQ: 2, DNS: 3 };

export function computeResults(state: AppState): Record<FieldId, ResultRow[]> {
  const best = firstScans(state.scans);
  const start = state.settings.startTime;
  const out = Object.fromEntries(FIELDS.map((f) => [f.id, [] as ResultRow[]])) as Record<FieldId, ResultRow[]>;

  for (const p of state.participants) {
    const scan = best.get(p.bib);
    const elapsed = scan ? (start ? elapsedSeconds(start, Date.parse(scan.ts)) : scan.elapsedSec) : undefined;
    const status: ResultStatus = p.status !== 'auto' ? p.status : scan ? 'gewertet' : 'DNS';
    out[fieldOf(p)].push({ participant: p, status, scan, elapsed });
  }

  for (const rows of Object.values(out)) {
    rows.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.status === 'gewertet' ? a.elapsed! - b.elapsed! : 0) ||
        Number(a.participant.bib) - Number(b.participant.bib),
    );
    // Gleiche Zeit → gleicher Platz (1, 1, 3 …)
    let prevTime = -1;
    let prevPlace = 0;
    rows.forEach((r, i) => {
      if (r.status !== 'gewertet') return;
      r.place = r.elapsed === prevTime ? prevPlace : i + 1;
      prevTime = r.elapsed!;
      prevPlace = r.place;
    });
  }
  return out;
}

export interface TeamRow {
  team: string;
  place: number;
  total: number;
  counted: ResultRow[];
  memberCount: number;
}

/** Teamwertung: Summe der 3 besten Zeiten je Feld; Teams mit weniger als 3 Gewerteten entfallen */
export function computeTeams(results: Record<FieldId, ResultRow[]>): Record<FieldId, TeamRow[]> {
  const out = {} as Record<FieldId, TeamRow[]>;
  for (const f of FIELDS) {
    const groups = new Map<string, ResultRow[]>();
    for (const r of results[f.id]) {
      const name = r.participant.team.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const teams: TeamRow[] = [];
    groups.forEach((rows) => {
      const counted = rows.filter((r) => r.status === 'gewertet').slice(0, 3);
      if (counted.length < 3) return;
      teams.push({
        team: rows[0].participant.team.trim(),
        place: 0,
        total: counted.reduce((sum, r) => sum + r.elapsed!, 0),
        counted,
        memberCount: rows.length,
      });
    });
    teams.sort((a, b) => a.total - b.total || a.team.localeCompare(b.team, 'de'));
    teams.forEach((t, i) => (t.place = i > 0 && t.total === teams[i - 1].total ? teams[i - 1].place : i + 1));
    out[f.id] = teams;
  }
  return out;
}

export function resultsCsv(results: Record<FieldId, ResultRow[]>): string {
  const rows: (string | number)[][] = [
    ['feld', 'platz', 'startnummer', 'vorname', 'nachname', 'team', 'zeit', 'status', 'zieluhrzeit', 'zielzeitstempel'],
  ];
  for (const f of FIELDS) {
    for (const r of results[f.id]) {
      const p = r.participant;
      rows.push([
        fieldLabel(f.id),
        r.place ?? '',
        p.bib,
        p.firstName,
        p.lastName,
        p.team,
        r.status === 'gewertet' ? formatDuration(r.elapsed!) : '',
        r.status === 'gewertet' ? 'gewertet' : r.status === 'DSQ' ? 'disqualifiziert' : r.status,
        r.scan ? clockTime(r.scan.ts) : '',
        r.scan?.ts ?? '',
      ]);
    }
  }
  return toCsv(rows);
}

export function teamsCsv(teams: Record<FieldId, TeamRow[]>): string {
  const rows: (string | number)[][] = [['feld', 'platz', 'team', 'summe', 'gewertete_laeufer']];
  for (const f of FIELDS) {
    for (const t of teams[f.id]) {
      rows.push([
        fieldLabel(f.id),
        t.place,
        t.team,
        formatDuration(t.total),
        t.counted.map((r) => `${fullName(r.participant)} (${formatDuration(r.elapsed!)})`).join(', '),
      ]);
    }
  }
  return toCsv(rows);
}
