export type Distance = '3.0' | '5.7';
export type Discipline = 'Lauf' | 'Walk';
export type FieldId = '3.0-Lauf' | '3.0-Walk' | '5.7-Lauf' | '5.7-Walk';

/** Manuell gesetzter Status. "auto" = gewertet, wenn gescannt, sonst DNS. */
export type ManualStatus = 'auto' | 'DNS' | 'DNF' | 'DSQ';
export type ResultStatus = 'gewertet' | 'DNS' | 'DNF' | 'DSQ';

export interface Participant {
  bib: string;
  firstName: string;
  lastName: string;
  distance: Distance;
  discipline: Discipline;
  team: string;
  status: ManualStatus;
}

export type ScanSource = 'kamera' | 'manuell' | 'korrektur';

export interface Scan {
  id: string;
  bib: string;
  /** Zielzeitpunkt als ISO-Zeitstempel */
  ts: string;
  /** Bruttozeit in Sekunden zum Zeitpunkt des Scans */
  elapsedSec: number;
  device: string;
  source: ScanSource;
  /** Gelöschte Scans bleiben als Markierung erhalten, damit das Zusammenführen sie nicht zurückholt. */
  deleted?: boolean;
}

export type ScanOutcome = 'ok' | 'duplicate' | 'unknown' | 'early' | 'nostart' | 'empty' | 'invalid';

export interface ScanEvent {
  id: string;
  at: string;
  outcome: ScanOutcome;
  input: string;
  scanId?: string;
  message: string;
}

export interface Settings {
  eventName: string;
  startTime: string | null;
  deviceName: string;
}

export interface AppState {
  version: 1;
  deviceId: string;
  settings: Settings;
  participants: Participant[];
  scans: Scan[];
  events: ScanEvent[];
  checklist: { scannerTested: boolean; dismissed: boolean };
}
