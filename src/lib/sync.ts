// Anbindung an den Server des Veranstalters: Login, Event/Run-Auswahl, Startzeit und Upload der Zielzeiten.
//
// Die API kennt zwei Streams (Zeiten und Scans) und ordnet sie über die Reihenfolge einander zu. Diese App erfasst
// beides mit einem Gerät in einem Schritt: Jeder Scan wird als Zeit-Eintrag UND als Scan-Eintrag mit derselben
// laufenden Nummer hochgeladen. Damit stimmt die Reihenfolge immer überein.
//
// Login-Daten liegen in einem eigenen Speicher (nicht im JSON-Backup). Das Passwort wird nie gespeichert.

import { useSyncExternalStore } from 'react';
import { ApiError, api, fromApiTime, labelOf, normalizeBaseUrl, runsOf, toApiTime } from './api';
import type { ApiRecord, FinishScan, FinishTime, UploadWarning } from './api';
import { getState, setState } from './store';
import type { Scan } from './types';

const KEY = 'benefizlauf-zeitnahme.server.v1';
const BATCH = 200;

export interface RunRef {
  id: number;
  label: string;
}

export interface StartSync {
  iso: string;
  runIds: number[];
  sentAt?: string;
  error?: string;
}

export interface UploadReport {
  at: string;
  sent: number;
  warnings: UploadWarning[];
  error?: string;
}

export interface ServerState {
  baseUrl: string;
  token: string | null;
  expiresAt: string | null;
  user: string;
  eventId: number | null;
  eventLabel: string;
  runs: RunRef[];
  /** Nächste freie laufende Nummer je Event – bleibt auch nach „Zielzeiten löschen“ erhalten */
  nextNumber: Record<string, number>;
  start: StartSync | null;
  lastUpload: UploadReport | null;
  /** Offene Server-Warnungen je laufender Nummer (z. B. unbekannte Startnummer) */
  warnings: Record<string, UploadWarning>;
}

const initial = (): ServerState => ({
  baseUrl: '',
  token: null,
  expiresAt: null,
  user: '',
  eventId: null,
  eventLabel: '',
  runs: [],
  nextNumber: {},
  start: null,
  lastUpload: null,
  warnings: {},
});

function load(): ServerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial(), ...(JSON.parse(raw) as ServerState) };
  } catch {
    /* neu beginnen */
  }
  return initial();
}

let server = load();
const listeners = new Set<() => void>();

function setServer(update: (s: ServerState) => ServerState) {
  server = update(server);
  try {
    localStorage.setItem(KEY, JSON.stringify(server));
  } catch {
    /* Speicher voll – Login geht dann beim Neustart verloren, Messdaten nicht */
  }
  listeners.forEach((l) => l());
}

export const getServer = () => server;
export const useServer = () =>
  useSyncExternalStore((l) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  }, getServer);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      server = load();
      listeners.forEach((l) => l());
    }
  });
}

/* ---------------- Status ---------------- */

export const isLoggedIn = (s = server) =>
  !!s.token && (!s.expiresAt || Date.parse(s.expiresAt) > Date.now());

/** Abgelaufen/ungültig: Token weg, Auswahl und Messdaten bleiben */
function dropSession() {
  setServer((s) => ({ ...s, token: null, expiresAt: null }));
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && e.needsLogin) dropSession();
    throw e;
  }
}

const desired = (sc: Scan) => (sc.deleted ? 'disabled' : 'active');

/** Nur auf diesem Gerät erfasste Zielzeiten. Korrekturen passieren in der Web-App des Veranstalters. */
const uploadable = (sc: Scan, deviceId: string) => sc.device === deviceId && sc.source !== 'korrektur';

export function needsUpload(sc: Scan, deviceId: string, eventId: number | null): boolean {
  if (eventId === null || !uploadable(sc, deviceId)) return false;
  if (sc.api?.event === eventId) return sc.api.sent !== desired(sc);
  return !sc.deleted;
}

export interface SyncCounts {
  pending: number;
  synced: number;
  /** Zielzeiten, die nicht automatisch übertragen werden (Korrekturen, andere Geräte) */
  local: number;
}

export function syncCounts(scans: Scan[], deviceId: string, eventId: number | null): SyncCounts {
  const c: SyncCounts = { pending: 0, synced: 0, local: 0 };
  for (const sc of scans) {
    if (!uploadable(sc, deviceId)) {
      if (!sc.deleted) c.local++;
    } else if (needsUpload(sc, deviceId, eventId)) c.pending++;
    else if (!sc.deleted && sc.api?.event === eventId) c.synced++;
  }
  return c;
}

/* ---------------- Verbindung & Login ---------------- */

export function setBaseUrl(raw: string) {
  const baseUrl = normalizeBaseUrl(raw);
  if (baseUrl === server.baseUrl) return;
  // Anderer Server → alte Session und Auswahl passen nicht mehr
  setServer((s) => ({ ...initial(), baseUrl, nextNumber: s.nextNumber }));
}

export async function login(email: string, password: string) {
  const s = await api.login(server.baseUrl, email.trim(), password);
  let user = email.trim();
  try {
    user = labelOf(await api.me(server.baseUrl, s.session_token), user);
  } catch {
    /* Anzeige-Name ist nicht wichtig */
  }
  setServer((st) => ({ ...st, token: s.session_token, expiresAt: fromApiTime(s.expires_at), user }));
}

/** Abmelden: Token lokal löschen, Messdaten bleiben. Server-Widerruf nur, wenn online. */
export async function logout() {
  const { baseUrl, token } = server;
  dropSession();
  if (token) await api.logout(baseUrl, token).catch(() => undefined);
}

export const loadEvents = () => guard(() => api.events(server.baseUrl, server.token!));

export async function loadRuns(eventId: number): Promise<ApiRecord[]> {
  const ev = await guard(() => api.event(server.baseUrl, server.token!, eventId));
  return runsOf(ev);
}

export function selectEvent(eventId: number | null, eventLabel = '') {
  setServer((s) =>
    s.eventId === eventId ? { ...s, eventLabel } : { ...s, eventId, eventLabel, runs: [], start: null, warnings: {} },
  );
}

export function selectRuns(runs: RunRef[]) {
  setServer((s) => ({ ...s, runs }));
}

/* ---------------- Startzeit ---------------- */

/** Startzeit für die gewählten Runs vormerken und sofort senden (falls möglich). */
export function queueStartTime(iso: string | null) {
  if (!iso || !server.runs.length) {
    setServer((s) => ({ ...s, start: null }));
    return Promise.resolve();
  }
  setServer((s) => ({ ...s, start: { iso, runIds: s.runs.map((r) => r.id) } }));
  return sendStartTime().catch(() => undefined);
}

let startBusy = false;

/** Vorgemerkte Startzeit senden. Wirft bei Fehler; der Fehler steht auch in server.start.error. */
export async function sendStartTime() {
  const job = server.start;
  if (!job || job.sentAt || startBusy || !isLoggedIn()) return;
  startBusy = true;
  try {
    for (const runId of job.runIds) await guard(() => api.setStartTime(server.baseUrl, server.token!, runId, job.iso));
    setServer((s) => (s.start?.iso === job.iso ? { ...s, start: { ...job, sentAt: new Date().toISOString() } } : s));
  } catch (e) {
    setServer((s) => (s.start?.iso === job.iso ? { ...s, start: { ...job, error: (e as Error).message } } : s));
    throw e;
  } finally {
    startBusy = false;
  }
}

/** Startzeit des ersten gewählten Runs vom Server lesen */
export async function fetchStartTime(): Promise<string | null> {
  const run = server.runs[0];
  if (!run) return null;
  const r = await guard(() => api.run(server.baseUrl, server.token!, run.id));
  return fromApiTime(r.start_time as string | undefined);
}

/* ---------------- Zielzeiten hochladen ---------------- */

/** Laufende Nummern vergeben (in Reihenfolge der Zielzeit). Werden gespeichert, bevor etwas gesendet wird. */
function assignNumbers(eventId: number) {
  const { deviceId, scans } = getState();
  const todo = scans
    .filter((sc) => uploadable(sc, deviceId) && !sc.deleted && sc.api?.event !== eventId)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (!todo.length) return;

  const used = scans.filter((sc) => sc.api?.event === eventId).map((sc) => sc.api!.number);
  let next = Math.max(server.nextNumber[eventId] ?? 0, used.length ? Math.max(...used) + 1 : 0);
  const numbers = new Map<string, number>();
  for (const sc of todo) numbers.set(sc.id, next++);

  setState((st) => ({
    ...st,
    scans: st.scans.map((sc) => (numbers.has(sc.id) ? { ...sc, api: { event: eventId, number: numbers.get(sc.id)! } } : sc)),
  }));
  setServer((s) => ({ ...s, nextNumber: { ...s.nextNumber, [eventId]: next } }));
}

let uploadBusy = false;
export const isUploading = () => uploadBusy;

/**
 * Zielzeiten hochladen. mode "pending": nur neue und geänderte, "all": alle dieses Geräts erneut.
 * Übermittelte Nummern ersetzen die Einträge auf dem Server, mehrfaches Senden ist also unschädlich.
 */
export async function uploadScans(mode: 'pending' | 'all' = 'pending'): Promise<UploadReport> {
  const eventId = server.eventId;
  if (eventId === null) throw new ApiError('Bitte zuerst eine Veranstaltung wählen.', -1);
  if (!isLoggedIn()) throw new ApiError('Bitte zuerst anmelden.', 401);
  if (uploadBusy) throw new ApiError('Upload läuft bereits.', -1);
  uploadBusy = true;

  const report: UploadReport = { at: new Date().toISOString(), sent: 0, warnings: [] };
  try {
    // Ausstehende Startzeit zuerst – ohne sie kann der Server keine Laufzeiten berechnen
    await sendStartTime().catch(() => undefined);

    assignNumbers(eventId);
    const { deviceId, scans } = getState();
    const batch = scans.filter(
      (sc) =>
        sc.api?.event === eventId &&
        uploadable(sc, deviceId) &&
        (mode === 'all' ? sc.api.sent !== undefined || !sc.deleted : needsUpload(sc, deviceId, eventId)),
    );

    for (let i = 0; i < batch.length; i += BATCH) {
      const part = batch.slice(i, i + BATCH);
      const times: FinishTime[] = part.map((sc) => ({ number: sc.api!.number, time: toApiTime(sc.ts), disabled: !!sc.deleted }));
      const scanRows: FinishScan[] = part.map((sc) => ({
        number: sc.api!.number,
        raw_value: sc.bib,
        scan_time: toApiTime(sc.ts),
        disabled: !!sc.deleted,
      }));

      const t = await guard(() => api.finishTimes(server.baseUrl, server.token!, eventId, times));
      const s = await guard(() => api.finishScans(server.baseUrl, server.token!, eventId, scanRows));
      const ok = new Set((t?.accepted_numbers ?? []).filter((n) => (s?.accepted_numbers ?? []).includes(n)));
      report.warnings.push(...(t?.warnings ?? []), ...(s?.warnings ?? []));

      // Bestätigten Zustand merken (den Zustand, der gesendet wurde – nicht einen inzwischen geänderten)
      const sentState = new Map(part.map((sc) => [sc.id, desired(sc)] as const));
      setState((st) => ({
        ...st,
        scans: st.scans.map((sc) =>
          sentState.has(sc.id) && sc.api && ok.has(sc.api.number) ? { ...sc, api: { ...sc.api, sent: sentState.get(sc.id) } } : sc,
        ),
      }));
      report.sent += ok.size;
      const fresh = [...(t?.warnings ?? []), ...(s?.warnings ?? [])];
      setServer((st) => {
        const warnings = { ...st.warnings };
        for (const n of ok) delete warnings[n];
        for (const w of fresh) warnings[w.number] = w;
        return { ...st, warnings };
      });
    }
  } catch (e) {
    report.error = (e as Error).message;
    throw Object.assign(e as Error, { report });
  } finally {
    uploadBusy = false;
    setServer((s) => ({ ...s, lastUpload: report }));
  }
  return report;
}

// Ausstehende Startzeit nachsenden, sobald wieder Netz da ist
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void sendStartTime().catch(() => undefined));
}
