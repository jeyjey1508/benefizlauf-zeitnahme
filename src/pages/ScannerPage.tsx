import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Clock, Copy, Undo2, UserX, XCircle } from 'lucide-react';
import { firstScans, registerScan, setStartTime, undoScan, useAppState, type ScanResult } from '../lib/store';
import { FIELDS, fieldLabel, fieldOf, fullName } from '../lib/fields';
import { clockTime, elapsedSeconds, formatDuration } from '../lib/time';
import { navigate, useNow, usePref, useWakeLock, START_QR_PREFIX } from '../lib/hooks';
import { feedbackError, feedbackSuccess, feedbackWarning, unlockAudio } from '../lib/feedback';
import type { ScanOutcome } from '../lib/types';
import { CameraScanner } from '../components/CameraScanner';
import { Checklist } from '../components/Checklist';
import { confirmDialog, toast } from '../components/ui';

const OUTCOME: Record<ScanOutcome, { title: string; tone: 'ok' | 'warn' | 'err'; badge: string }> = {
  ok: { title: 'Gespeichert', tone: 'ok', badge: 'Gespeichert' },
  duplicate: { title: 'Doppelscan', tone: 'warn', badge: 'Doppelt' },
  unknown: { title: 'Unbekannte Nummer', tone: 'err', badge: 'Unbekannt' },
  early: { title: 'Scan vor dem Start', tone: 'err', badge: 'Vor Start' },
  nostart: { title: 'Startzeit fehlt', tone: 'err', badge: 'Keine Startzeit' },
  empty: { title: 'Teilnehmerliste leer', tone: 'err', badge: 'Liste leer' },
  invalid: { title: 'Ungültige Eingabe', tone: 'err', badge: 'Ungültig' },
};

export function ScannerPage() {
  const s = useAppState();
  const now = useNow(250);
  useWakeLock();
  const [cameraOn, setCameraOn] = usePref('cameraOn', false);
  const [value, setValue] = useState('');
  const [last, setLast] = useState<ScanResult | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = s.settings.startTime;
  const running = start ? now >= Date.parse(start) : false;
  const best = useMemo(() => firstScans(s.scans), [s.scans]);
  const scanById = useMemo(() => new Map(s.scans.map((sc) => [sc.id, sc])), [s.scans]);

  const counters = useMemo(
    () =>
      FIELDS.map((f) => {
        const members = s.participants.filter((p) => fieldOf(p) === f.id);
        return { ...f, total: members.length, done: members.filter((p) => best.has(p.bib)).length };
      }),
    [s.participants, best],
  );

  async function adoptStart(iso: string) {
    if (Number.isNaN(Date.parse(iso))) return;
    if (iso === start) return toast('Startzeit ist bereits identisch.');
    const ok = await confirmDialog({
      title: 'Startzeit übernehmen?',
      message: `Der QR-Code enthält die Startzeit ${clockTime(iso)} Uhr. ${start ? `Die bisherige Startzeit ${clockTime(start)} Uhr wird ersetzt.` : ''}`,
      confirmLabel: 'Übernehmen',
    });
    if (ok) {
      setStartTime(iso);
      toast(`Startzeit ${clockTime(iso)} Uhr übernommen.`);
    }
  }

  function handle(text: string, source: 'kamera' | 'manuell') {
    unlockAudio();
    if (text.startsWith(START_QR_PREFIX)) return void adoptStart(text.slice(START_QR_PREFIX.length));
    const r = registerScan(text, source);
    setLast(r);
    setFlashKey((k) => k + 1);
    const tone = OUTCOME[r.event.outcome].tone;
    if (tone === 'ok') feedbackSuccess();
    else if (tone === 'warn') feedbackWarning();
    else feedbackError();
  }

  async function undo(scanId: string, label: string) {
    const ok = await confirmDialog({
      title: 'Scan zurücknehmen?',
      message: `Die Zielzeit von ${label} wird gelöscht. Danach kann die Nummer neu erfasst werden.`,
      confirmLabel: 'Zurücknehmen',
      danger: true,
    });
    if (ok) {
      undoScan(scanId);
      if (last?.scan?.id === scanId) setLast(null);
      toast('Scan zurückgenommen.');
    }
  }

  const recent = s.events.slice(0, 15);

  return (
    <div className="page">
      <div className="stack">
        <Checklist />

        {!start && s.participants.length > 0 && (
          <div className="banner banner-err">
            <AlertTriangle />
            <div className="banner-body">
              <div className="banner-title">Startzeit ist noch nicht gesetzt</div>
              <div>Ohne Startzeit werden keine Zielzeiten gespeichert.</div>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('einstellungen')}>
              Startzeit setzen
            </button>
          </div>
        )}
        {s.participants.length === 0 && (
          <div className="banner banner-warn">
            <UserX />
            <div className="banner-body">
              <div className="banner-title">Noch keine Teilnehmer</div>
              <div>Importiere zuerst die Teilnehmerliste.</div>
            </div>
            <button className="btn" onClick={() => navigate('teilnehmer')}>
              Zu den Teilnehmern
            </button>
          </div>
        )}

        <div className="scan-layout">
          <div className="stack">
            <div className="card clock">
              <div>
                <div className="clock-label">{running ? 'Laufzeit' : start ? 'Start in' : 'Laufzeit'}</div>
                <div className={`clock-value${start ? '' : ' idle'}`}>
                  {start
                    ? running
                      ? formatDuration(elapsedSeconds(start, now))
                      : `-${formatDuration(Math.ceil((Date.parse(start) - now) / 1000))}`
                    : '00:00:00'}
                </div>
              </div>
              <div className="clock-side">
                <div>Start</div>
                <div className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {start ? `${clockTime(start)} Uhr` : 'nicht gesetzt'}
                </div>
              </div>
            </div>

            <ResultPanel key={flashKey} result={last} />

            <form
              className="entry"
              onSubmit={(e) => {
                e.preventDefault();
                if (!value.trim()) return;
                handle(value, 'manuell');
                setValue('');
                inputRef.current?.focus();
              }}
            >
              <input
                ref={inputRef}
                className="input"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                placeholder="Startnummer"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\s/g, ''))}
                aria-label="Startnummer eingeben"
              />
              <button className="btn btn-primary">Erfassen</button>
            </form>

            <button className="btn btn-block btn-lg" onClick={() => setCameraOn(!cameraOn)}>
              {cameraOn ? <CameraOff /> : <Camera />}
              {cameraOn ? 'Kamera ausschalten' : 'Kamera-Scan starten'}
            </button>
            {cameraOn && <CameraScanner onDetect={(t) => handle(t, 'kamera')} />}
          </div>

          <div className="stack">
            <div className="counters">
              {counters.map((c) => (
                <div key={c.id} className="card counter">
                  <div className="counter-label">{c.short}</div>
                  <div className="counter-value">
                    {c.done}
                    <small> / {c.total}</small>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <section className="card">
              <div className="section-head">
                <h2 className="section-title">Letzte Scans</h2>
                <span className="muted num">{best.size} im Ziel</span>
              </div>
              {recent.length === 0 ? (
                <p className="muted" style={{ padding: '20px 16px' }}>
                  Noch keine Scans.
                </p>
              ) : (
                recent.map((e) => {
                  const o = OUTCOME[e.outcome];
                  const scan = e.scanId ? scanById.get(e.scanId) : undefined;
                  const p = s.participants.find((x) => x.bib === (scan?.bib ?? e.input.replace(/^0+(?=\d)/, '')));
                  const undone = e.outcome === 'ok' && (!scan || scan.deleted);
                  return (
                    <div key={e.id} className={`log-row${undone ? ' log-undone' : ''}`}>
                      <div className="log-time">{clockTime(e.at)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="log-title">
                          <span className="num">{e.input ? `Nr. ${e.input}` : '–'}</span>
                          {p && <span>{fullName(p)}</span>}
                        </div>
                        <div className="log-sub">
                          {e.outcome === 'ok'
                            ? undone
                              ? 'Zurückgenommen'
                              : `${fieldLabel(fieldOf(p!))} · Zeit ${formatDuration(scan!.elapsedSec)}`
                            : e.message}
                        </div>
                      </div>
                      {e.outcome === 'ok' && !undone ? (
                        <button
                          className="btn btn-ghost btn-icon"
                          aria-label="Scan zurücknehmen"
                          title="Scan zurücknehmen"
                          onClick={() => undo(scan!.id, `Nr. ${e.input}`)}
                        >
                          <Undo2 />
                        </button>
                      ) : (
                        <span className={`badge badge-${undone ? '' : o.tone}`}>{undone ? 'Gelöscht' : o.badge}</span>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: ScanResult | null }) {
  if (!result)
    return (
      <div className="result result-idle">
        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text)' }}>Bereit</div>
        <div>Startnummer scannen oder eingeben.</div>
      </div>
    );

  const { event, participant: p, scan } = result;
  const o = OUTCOME[event.outcome];
  const Icon = o.tone === 'ok' ? CheckCircle2 : o.tone === 'warn' ? Copy : event.outcome === 'early' ? Clock : XCircle;
  return (
    <div className={`result result-${o.tone} flash`} role="status" aria-live="assertive">
      <div className="result-head">
        <Icon />
        {o.title}
      </div>
      {p ? (
        <>
          <div className="result-main">
            <span className="result-bib">{p.bib}</span>
            {scan && <span className="result-time">{formatDuration(scan.elapsedSec)}</span>}
          </div>
          <div className="result-name">{fullName(p)}</div>
          <div className="result-meta">
            {fieldLabel(fieldOf(p))}
            {p.team && ` · ${p.team}`}
          </div>
          {!scan && <div className="result-msg">{event.message}</div>}
        </>
      ) : (
        <>
          {event.input && event.outcome === 'unknown' && (
            <div className="result-main">
              <span className="result-bib">{event.input}</span>
            </div>
          )}
          <div className="result-msg">{event.message}</div>
        </>
      )}
    </div>
  );
}
