import { useEffect, useState, type FormEvent } from 'react';
import { CloudDownload, CloudUpload, LogIn, LogOut, RefreshCw, Server } from 'lucide-react';
import { labelOf, type ApiRecord } from '../lib/api';
import { setStartTime, useAppState } from '../lib/store';
import {
  fetchStartTime,
  isLoggedIn,
  loadEvents,
  loadRuns,
  login,
  logout,
  queueStartTime,
  selectEvent,
  selectRuns,
  sendStartTime,
  setBaseUrl,
  syncCounts,
  uploadScans,
  useServer,
  type RunRef,
} from '../lib/sync';
import { clockTime, dateLabel } from '../lib/time';
import { confirmDialog, toast } from './ui';

const errText = (e: unknown) => (e as Error)?.message ?? 'Unbekannter Fehler';
const parseIds = (raw: string) =>
  raw
    .split(/[\s,;]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);

export function ServerCard() {
  const s = useAppState();
  const srv = useServer();
  const loggedIn = isLoggedIn(srv);
  const [url, setUrl] = useState(srv.baseUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ApiRecord[] | null>(null);
  const [runs, setRuns] = useState<ApiRecord[] | null>(null);
  const [eventIdInput, setEventIdInput] = useState(srv.eventId ? String(srv.eventId) : '');
  const [runIdsInput, setRunIdsInput] = useState(srv.runs.map((r) => r.id).join(', '));

  useEffect(() => setUrl(srv.baseUrl), [srv.baseUrl]);
  useEffect(() => setEventIdInput(srv.eventId ? String(srv.eventId) : ''), [srv.eventId]);
  useEffect(() => setRunIdsInput(srv.runs.map((r) => r.id).join(', ')), [srv.runs]);

  const counts = syncCounts(s.scans, s.deviceId, srv.eventId);
  const start = s.settings.startTime;

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errText(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setBaseUrl(url);
    const ok = await run('login', async () => {
      await login(email, password);
      return true;
    });
    setPassword('');
    if (ok) {
      toast('Angemeldet.');
      void refreshEvents();
    }
  }

  async function onLogout() {
    const ok = await confirmDialog({
      title: 'Abmelden?',
      message: 'Die Zielzeiten auf diesem Gerät bleiben erhalten. Zum Hochladen ist danach eine neue Anmeldung nötig.',
      confirmLabel: 'Abmelden',
    });
    if (ok) {
      await logout();
      toast('Abgemeldet.');
    }
  }

  async function refreshEvents() {
    const list = await run('events', loadEvents);
    if (list) setEvents(list);
  }

  async function chooseEvent(id: number | null, label = '') {
    selectEvent(id, label);
    setRuns(null);
    if (id === null) return;
    const list = await run('runs', () => loadRuns(id));
    if (list) {
      setRuns(list);
      // Nur ein Run → direkt auswählen
      if (list.length === 1) selectRuns([{ id: list[0].id, label: labelOf(list[0], `Run ${list[0].id}`) }]);
    }
  }

  function toggleRun(r: ApiRecord, on: boolean) {
    const ref: RunRef = { id: r.id, label: labelOf(r, `Run ${r.id}`) };
    selectRuns(on ? [...srv.runs.filter((x) => x.id !== r.id), ref] : srv.runs.filter((x) => x.id !== r.id));
  }

  function applyManualIds() {
    const [eventId] = parseIds(eventIdInput);
    if (!eventId) return setError('Bitte eine gültige Veranstaltungs-ID eingeben.');
    if (eventId !== srv.eventId) selectEvent(eventId, '');
    selectRuns(parseIds(runIdsInput).map((id) => ({ id, label: `Run ${id}` })));
    setError(null);
    toast('IDs übernommen.');
  }

  async function sendStart() {
    if (!start) return;
    if (!srv.start || srv.start.iso !== start) await queueStartTime(start);
    else await run('start', sendStartTime);
  }

  async function takeServerStart() {
    const iso = await run('start', fetchStartTime);
    if (iso === undefined) return;
    if (!iso) return toast('Auf dem Server ist noch keine Startzeit gesetzt.', 'err');
    if (iso === start) return toast('Startzeit ist bereits identisch.');
    const ok = await confirmDialog({
      title: 'Startzeit vom Server übernehmen?',
      message: `Server: ${clockTime(iso)} Uhr (${dateLabel(iso)}).${start ? ` Die Startzeit dieses Geräts (${clockTime(start)} Uhr) wird ersetzt.` : ''}`,
      confirmLabel: 'Übernehmen',
    });
    if (ok) {
      setStartTime(iso);
      toast(`Startzeit ${clockTime(iso)} Uhr übernommen.`);
    }
  }

  async function upload(mode: 'pending' | 'all') {
    const r = await run('upload', () => uploadScans(mode));
    if (r) toast(r.sent ? `${r.sent} Zielzeiten hochgeladen.` : 'Nichts hochzuladen.');
  }

  const startState = !start
    ? null
    : !srv.start || srv.start.iso !== start
      ? { tone: 'warn', text: 'Nicht an den Server gesendet' }
      : srv.start.sentAt
        ? { tone: 'ok', text: `Gesendet um ${clockTime(srv.start.sentAt)} Uhr` }
        : { tone: 'warn', text: srv.start.error ? `Ausstehend – ${srv.start.error}` : 'Ausstehend' };

  const report = srv.lastUpload;
  const activeNumbers = new Set(
    s.scans.filter((sc) => !sc.deleted && sc.api?.event === srv.eventId).map((sc) => sc.api!.number),
  );
  const openWarnings = Object.values(srv.warnings ?? {}).filter((w) => activeNumbers.has(w.number));
  const unknownBibs = [...new Set(openWarnings.filter((w) => w.code === 'unknown_bib').map((w) => w.raw_value ?? '?'))];
  const otherWarnings = openWarnings.filter((w) => w.code !== 'unknown_bib');

  return (
    <section className="card card-pad stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="card-title">Server (REST-API)</h2>
          <p className="card-desc">Startzeit und Zielzeiten an die Web-App des Veranstalters senden.</p>
        </div>
        {loggedIn ? (
          <span className="badge badge-ok">Angemeldet</span>
        ) : (
          <span className="badge badge-warn">{srv.baseUrl ? 'Abgemeldet' : 'Nicht eingerichtet'}</span>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {!loggedIn ? (
        <form className="stack" onSubmit={onLogin}>
          <label className="field">
            <span className="label">Server-Adresse</span>
            <input
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setBaseUrl(url)}
              required
            />
          </label>
          {srv.baseUrl && srv.expiresAt && Date.parse(srv.expiresAt) <= Date.now() && (
            <p className="hint">Die Anmeldung ist abgelaufen. Bitte neu anmelden – die Zielzeiten bleiben erhalten.</p>
          )}
          <div className="grid-2">
            <label className="field">
              <span className="label">E-Mail</span>
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="label">Passwort</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </div>
          <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!!busy}>
            <LogIn /> {busy === 'login' ? 'Anmelden …' : 'Anmelden'}
          </button>
          <p className="hint">Das Passwort wird nicht gespeichert, nur die Anmeldung (gültig bis zu 7 Tage).</p>
        </form>
      ) : (
        <>
          <div>
            <div className="kv">
              <span className="muted">Server</span>
              <span className="num" style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>
                {srv.baseUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>
            <div className="kv">
              <span className="muted">Account</span>
              <span style={{ overflowWrap: 'anywhere', textAlign: 'right' }}>{srv.user}</span>
            </div>
            {srv.expiresAt && (
              <div className="kv">
                <span className="muted">Gültig bis</span>
                <span>{dateLabel(srv.expiresAt)}</span>
              </div>
            )}
          </div>
          <button className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={onLogout}>
            <LogOut /> Abmelden
          </button>

          <div className="divider" />

          {/* Veranstaltung & Läufe */}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>
              <Server style={{ verticalAlign: '-3px', width: 18, height: 18 }} /> Veranstaltung
            </span>
            <button className="btn btn-ghost" onClick={refreshEvents} disabled={!!busy}>
              <RefreshCw /> {busy === 'events' ? 'Lädt …' : 'Liste laden'}
            </button>
          </div>

          {events && (
            <label className="field">
              <span className="label">Veranstaltung wählen</span>
              <select
                className="select"
                value={srv.eventId ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const ev = events.find((x) => x.id === id);
                  void chooseEvent(id, labelOf(ev, id ? `Veranstaltung ${id}` : ''));
                }}
              >
                <option value="">– bitte wählen –</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {labelOf(ev, `Veranstaltung ${ev.id}`)} (ID {ev.id})
                  </option>
                ))}
              </select>
              {events.length === 0 && <span className="hint">Diesem Account ist keine Veranstaltung zugeordnet.</span>}
            </label>
          )}

          {runs && runs.length > 0 && (
            <div className="field">
              <span className="label">Läufe für die Startzeit (Massenstart: alle wählen)</span>
              {runs.map((r) => (
                <label key={r.id} className="row" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={srv.runs.some((x) => x.id === r.id)}
                    onChange={(e) => toggleRun(r, e.target.checked)}
                  />
                  {labelOf(r, `Run ${r.id}`)} <span className="muted">(ID {r.id})</span>
                </label>
              ))}
            </div>
          )}
          {runs && runs.length === 0 && (
            <p className="hint">Zu dieser Veranstaltung wurden keine Läufe geliefert. IDs unten von Hand eintragen.</p>
          )}

          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              IDs von Hand eintragen
            </summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="grid-2">
                <label className="field">
                  <span className="label">Veranstaltungs-ID</span>
                  <input
                    className="input num"
                    inputMode="numeric"
                    value={eventIdInput}
                    onChange={(e) => setEventIdInput(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="label">Lauf-IDs (Komma)</span>
                  <input
                    className="input num"
                    inputMode="numeric"
                    value={runIdsInput}
                    onChange={(e) => setRunIdsInput(e.target.value)}
                  />
                </label>
              </div>
              <button className="btn" style={{ justifySelf: 'start' }} onClick={applyManualIds}>
                Übernehmen
              </button>
            </div>
          </details>

          <div>
            <div className="kv">
              <span className="muted">Gewählt</span>
              <span style={{ textAlign: 'right' }}>
                {srv.eventId ? `${srv.eventLabel || 'Veranstaltung'} (ID ${srv.eventId})` : '–'}
              </span>
            </div>
            <div className="kv">
              <span className="muted">Läufe</span>
              <span style={{ textAlign: 'right' }}>{srv.runs.length ? srv.runs.map((r) => r.label).join(', ') : '–'}</span>
            </div>
          </div>

          <div className="divider" />

          {/* Startzeit */}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>Startzeit auf dem Server</span>
            {startState && <span className={`badge badge-${startState.tone}`}>{startState.tone === 'ok' ? 'Gesendet' : 'Offen'}</span>}
          </div>
          {startState && <p className="hint">{startState.text}</p>}
          <div className="row">
            <button className="btn" onClick={sendStart} disabled={!start || !srv.runs.length || !!busy}>
              <CloudUpload /> Startzeit senden
            </button>
            <button className="btn btn-ghost" onClick={takeServerStart} disabled={!srv.runs.length || !!busy}>
              <CloudDownload /> Vom Server übernehmen
            </button>
          </div>
          {!srv.runs.length && <p className="hint">Dafür zuerst mindestens einen Lauf wählen.</p>}

          <div className="divider" />

          {/* Zielzeiten */}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>Zielzeiten</span>
            {counts.pending ? (
              <span className="badge badge-warn">{counts.pending} offen</span>
            ) : (
              <span className="badge badge-ok">Alles gesendet</span>
            )}
          </div>
          <div>
            <div className="kv">
              <span className="muted">Hochgeladen</span>
              <span className="num">{counts.synced}</span>
            </div>
            <div className="kv">
              <span className="muted">Noch zu senden</span>
              <span className="num">{counts.pending}</span>
            </div>
            {counts.local > 0 && (
              <div className="kv">
                <span className="muted">Nur lokal</span>
                <span className="num">{counts.local}</span>
              </div>
            )}
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => upload('pending')} disabled={!srv.eventId || !!busy}>
              <CloudUpload /> {busy === 'upload' ? 'Lädt hoch …' : 'Hochladen'}
            </button>
            <button className="btn btn-ghost" onClick={() => upload('all')} disabled={!srv.eventId || !!busy}>
              Alle erneut senden
            </button>
          </div>
          {report && (
            <p className="hint">
              Letzter Upload {clockTime(report.at)} Uhr: {report.error ? `Fehler – ${report.error}` : `${report.sent} übertragen.`}
            </p>
          )}
          {unknownBibs.length > 0 && (
            <div className="banner banner-warn">
              <div className="banner-body">
                <div className="banner-title">Server kennt diese Startnummern nicht</div>
                <div>
                  {unknownBibs.join(', ')} – gespeichert, aber bitte in der Web-App prüfen.
                </div>
              </div>
            </div>
          )}
          {otherWarnings.length > 0 && (
            <p className="hint">
              Weitere Hinweise vom Server: {otherWarnings.map((w) => `Nr. ${w.number}: ${w.code}`).join(', ')}
            </p>
          )}
          <p className="hint">
            Übertragen werden nur Zielzeiten, die auf diesem Gerät gescannt wurden.
            {counts.local > 0 && ' Korrekturen von Hand und Zeiten anderer Geräte bitte in der Web-App eintragen.'} Lokal
            löschen entfernt nichts auf dem Server; zurückgenommene Scans werden dort deaktiviert.
          </p>
        </>
      )}
    </section>
  );
}
