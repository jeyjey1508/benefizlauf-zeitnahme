import type { AppState, Participant, Scan } from './types';
import { getState, setState } from './store';
import { clockTime } from './time';

const APP_ID = 'benefizlauf-zeitnahme';

interface BackupFile {
  app: typeof APP_ID;
  version: 1;
  exportedAt: string;
  deviceId: string;
  deviceName: string;
  settings: AppState['settings'];
  participants: Participant[];
  scans: Scan[];
}

export function createBackup(): string {
  const s = getState();
  const data: BackupFile = {
    app: APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    deviceId: s.deviceId,
    deviceName: s.settings.deviceName,
    settings: s.settings,
    participants: s.participants,
    scans: s.scans,
  };
  return JSON.stringify(data, null, 2);
}

export function parseBackup(text: string): BackupFile {
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON-Backup.');
  }
  if (data?.app !== APP_ID || !Array.isArray(data.participants) || !Array.isArray(data.scans))
    throw new Error('Die Datei ist kein Backup dieser App.');
  return data;
}

export interface MergeSummary {
  newParticipants: number;
  newScans: number;
  removedScans: number;
  startConflict?: string;
}

/** Backup eines anderen Geräts dazunehmen: Teilnehmer ergänzen, Scans vereinen (früheste Zeit zählt). */
export function mergeBackup(data: BackupFile): MergeSummary {
  const s = getState();
  const bibs = new Set(s.participants.map((p) => p.bib));
  const addParticipants = data.participants.filter((p) => !bibs.has(p.bib));

  const byId = new Map(s.scans.map((sc) => [sc.id, sc]));
  let newScans = 0;
  let removedScans = 0;
  for (const sc of data.scans) {
    const local = byId.get(sc.id);
    if (!local) {
      byId.set(sc.id, sc);
      if (!sc.deleted) newScans++;
    } else if (sc.deleted && !local.deleted) {
      byId.set(sc.id, { ...local, deleted: true });
      removedScans++;
    }
  }

  const localStart = s.settings.startTime;
  const otherStart = data.settings?.startTime ?? null;
  const startConflict =
    localStart && otherStart && localStart !== otherStart
      ? `Das andere Gerät hat eine andere Startzeit (${clockTime(otherStart)} Uhr). Die Startzeit dieses Geräts (${clockTime(localStart)} Uhr) bleibt erhalten.`
      : undefined;

  setState((st) => ({
    ...st,
    settings: { ...st.settings, startTime: st.settings.startTime ?? otherStart },
    participants: [...st.participants, ...addParticipants],
    scans: [...byId.values()],
  }));
  return { newParticipants: addParticipants.length, newScans, removedScans, startConflict };
}

/** Alle Daten dieses Geräts durch das Backup ersetzen */
export function replaceWithBackup(data: BackupFile) {
  setState((st) => ({
    ...st,
    settings: { ...st.settings, eventName: data.settings.eventName, startTime: data.settings.startTime },
    participants: data.participants,
    scans: data.scans,
    events: [],
  }));
}
