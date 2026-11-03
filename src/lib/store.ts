import { useSyncExternalStore } from 'react';
import type { AppState, ManualStatus, Participant, Scan, ScanEvent, ScanSource, Settings } from './types';
import { fullName, fieldLabel, fieldOf, normalizeBib } from './fields';
import { clockTime, elapsedSeconds, formatDuration } from './time';

const KEY = 'benefizlauf-zeitnahme.v1';
const MAX_EVENTS = 100;

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function initialState(): AppState {
  return {
    version: 1,
    deviceId: uid().slice(0, 8),
    settings: { eventName: 'Benefizlauf', startTime: null, deviceName: '' },
    participants: [],
    scans: [],
    events: [],
    checklist: { scannerTested: false, dismissed: false },
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.version === 1) return { ...initialState(), ...parsed };
    }
  } catch {
    /* beschädigte Daten → neu beginnen */
  }
  return initialState();
}

let state: AppState = load();
let saveError = false;
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = false;
  } catch {
    saveError = true;
  }
}

const emit = () => listeners.forEach((l) => l());

export function setState(update: (s: AppState) => AppState) {
  state = update(state);
  persist();
  emit();
}

export const getState = () => state;
export const hasSaveError = () => saveError;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useAppState = () => useSyncExternalStore(subscribe, getState);

// Änderungen aus einem anderen Tab übernehmen
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load();
      emit();
    }
  });
  // Dauerhaften Speicher anfragen, damit der Browser die Daten nicht aufräumt
  navigator.storage?.persist?.().catch(() => undefined);
}

/* ---------------- Aktionen ---------------- */

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export const setStartTime = (iso: string | null) => updateSettings({ startTime: iso });

/** Erster gültiger (nicht gelöschter) Scan pro Startnummer */
export function firstScans(scans: Scan[]): Map<string, Scan> {
  const map = new Map<string, Scan>();
  for (const sc of scans) {
    if (sc.deleted) continue;
    const prev = map.get(sc.bib);
    if (!prev || sc.ts < prev.ts) map.set(sc.bib, sc);
  }
  return map;
}

export interface ScanResult {
  event: ScanEvent;
  participant?: Participant;
  scan?: Scan;
  firstScan?: Scan;
}

export function registerScan(input: string, source: ScanSource, now = Date.now()): ScanResult {
  const s = state;
  const raw = input.trim();
  const make = (outcome: ScanEvent['outcome'], message: string, scanId?: string): ScanEvent => ({
    id: uid(),
    at: new Date(now).toISOString(),
    outcome,
    input: raw,
    scanId,
    message,
  });
  const fail = (event: ScanEvent, extra: Partial<ScanResult> = {}): ScanResult => {
    setState((st) => ({ ...st, events: [event, ...st.events].slice(0, MAX_EVENTS) }));
    return { event, ...extra };
  };

  if (s.participants.length === 0)
    return fail(make('empty', 'Die Teilnehmerliste ist leer. Bitte zuerst Teilnehmer importieren.'));

  const bib = normalizeBib(raw);
  if (!bib) return fail(make('invalid', `"${raw}" ist keine gültige Startnummer.`));

  const start = s.settings.startTime;
  if (!start) return fail(make('nostart', 'Die Startzeit ist noch nicht gesetzt. Bitte in den Einstellungen setzen.'));

  const participant = s.participants.find((p) => p.bib === bib);
  if (!participant) return fail(make('unknown', `Startnummer ${bib} steht nicht in der Teilnehmerliste.`));

  if (now < Date.parse(start))
    return fail(make('early', `Scan vor dem Start. Startzeit ist ${clockTime(start)} Uhr.`), { participant });

  const existing = firstScans(s.scans).get(bib);
  if (existing) {
    const t = formatDuration(elapsedSeconds(start, Date.parse(existing.ts)));
    return fail(
      make('duplicate', `Bereits um ${clockTime(existing.ts)} Uhr erfasst (Zeit ${t}). Die erste Zeit bleibt gültig.`),
      { participant, firstScan: existing },
    );
  }

  const scan: Scan = {
    id: uid(),
    bib,
    ts: new Date(now).toISOString(),
    elapsedSec: elapsedSeconds(start, now),
    device: s.deviceId,
    source,
  };
  const event = make('ok', `${fullName(participant)} · ${fieldLabel(fieldOf(participant))}`, scan.id);
  setState((st) => ({
    ...st,
    scans: [...st.scans, scan],
    events: [event, ...st.events].slice(0, MAX_EVENTS),
  }));
  return { event, participant, scan };
}

/** Scan zurücknehmen (bleibt als gelöscht markiert, damit Zusammenführen ihn nicht zurückholt) */
export function undoScan(scanId: string) {
  setState((s) => ({
    ...s,
    scans: s.scans.map((sc) => (sc.id === scanId ? { ...sc, deleted: true } : sc)),
  }));
}

/** Bruttozeit von Hand setzen (ersetzt vorhandene Scans) oder entfernen (elapsed = null) */
export function setManualTime(bib: string, elapsed: number | null) {
  setState((s) => {
    const scans = s.scans.map((sc) => (sc.bib === bib && !sc.deleted ? { ...sc, deleted: true } : sc));
    if (elapsed !== null && s.settings.startTime) {
      scans.push({
        id: uid(),
        bib,
        ts: new Date(Date.parse(s.settings.startTime) + elapsed * 1000).toISOString(),
        elapsedSec: elapsed,
        device: s.deviceId,
        source: 'korrektur',
      });
    }
    return { ...s, scans };
  });
}

export function setParticipantStatus(bib: string, status: ManualStatus) {
  setState((s) => ({ ...s, participants: s.participants.map((p) => (p.bib === bib ? { ...p, status } : p)) }));
}

/** Teilnehmer anlegen oder ändern. Gibt eine Fehlermeldung zurück oder null. */
export function saveParticipant(p: Participant, originalBib?: string): string | null {
  const clash = state.participants.some((x) => x.bib === p.bib && x.bib !== originalBib);
  if (clash) return `Die Startnummer ${p.bib} ist bereits vergeben.`;
  setState((s) => {
    if (originalBib === undefined) return { ...s, participants: [...s.participants, p] };
    return {
      ...s,
      participants: s.participants.map((x) => (x.bib === originalBib ? p : x)),
      // Startnummer geändert → Scans umhängen
      scans: originalBib !== p.bib ? s.scans.map((sc) => (sc.bib === originalBib ? { ...sc, bib: p.bib } : sc)) : s.scans,
    };
  });
  return null;
}

export function deleteParticipant(bib: string) {
  setState((s) => ({
    ...s,
    participants: s.participants.filter((p) => p.bib !== bib),
    scans: s.scans.map((sc) => (sc.bib === bib ? { ...sc, deleted: true } : sc)),
  }));
}

export function importParticipants(list: Participant[], replace: boolean) {
  setState((s) => ({ ...s, participants: replace ? list : [...s.participants, ...list] }));
}

export function clearScans() {
  setState((s) => ({ ...s, scans: [], events: [] }));
}

export function resetAll() {
  const keepDevice = state.deviceId;
  setState(() => ({ ...initialState(), deviceId: keepDevice }));
}

export function markScannerTested() {
  if (!state.checklist.scannerTested) setState((s) => ({ ...s, checklist: { ...s.checklist, scannerTested: true } }));
}

export function dismissChecklist() {
  setState((s) => ({ ...s, checklist: { ...s.checklist, dismissed: true } }));
}
