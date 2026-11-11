import { useEffect, useState } from 'react';
import { DatabaseBackup, Download, FileUp, QrCode as QrIcon, Smartphone, Timer, Trash2 } from 'lucide-react';
import { clearScans, firstScans, hasSaveError, resetAll, setStartTime, updateSettings, useAppState } from '../lib/store';
import { createBackup, mergeBackup, parseBackup, replaceWithBackup } from '../lib/backup';
import { SAMPLE_CSV } from '../lib/csv';
import { downloadFile, safeName } from '../lib/download';
import { START_QR_PREFIX } from '../lib/hooks';
import { clockTime, dateLabel, fileStamp, localToIso, toDateInput, toTimeInput } from '../lib/time';
import { Dialog, confirmDialog, pickFile, toast } from '../components/ui';
import { QrCode } from '../components/QrCode';
import { useInstall } from '../lib/install';
import { queueStartTime } from '../lib/sync';
import { ServerCard } from '../components/ServerCard';

/** "093000" → "09:30:00" während der Eingabe */
const maskTime = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 6);
  return d.replace(/^(\d{2})(\d{1,2})?(\d{1,2})?$/, (_, h, m, s) => [h, m, s].filter(Boolean).join(':'));
};

export function SettingsPage() {
  const s = useAppState();
  const start = s.settings.startTime;
  const [date, setDate] = useState(() => toDateInput(start ? new Date(start) : new Date()));
  const [time, setTime] = useState(() => (start ? toTimeInput(new Date(start)) : ''));
  const [timeError, setTimeError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [backup, setBackup] = useState<ReturnType<typeof parseBackup> | null>(null);
  const install = useInstall();

  useEffect(() => {
    if (start) {
      setDate(toDateInput(new Date(start)));
      setTime(toTimeInput(new Date(start)));
    }
  }, [start]);

  const scanCount = firstScans(s.scans).size;

  async function startNow() {
    const now = new Date();
    now.setMilliseconds(0);
    if (start) {
      const ok = await confirmDialog({
        title: 'Startzeit überschreiben?',
        message: `Die Startzeit ${clockTime(start)} Uhr wird durch ${clockTime(now.toISOString())} Uhr ersetzt. Alle Zeiten werden neu berechnet.`,
        confirmLabel: 'Überschreiben',
        danger: true,
      });
      if (!ok) return;
    }
    setStartTime(now.toISOString());
    void queueStartTime(now.toISOString());
    toast(`Startzeit ${clockTime(now.toISOString())} Uhr gesetzt.`);
  }

  async function applyManual() {
    const iso = localToIso(date, time);
    if (!iso) return setTimeError('Bitte Datum und Uhrzeit im Format HH:MM:SS eingeben.');
    setTimeError(null);
    if (start && start !== iso) {
      const ok = await confirmDialog({
        title: 'Startzeit ändern?',
        message: `Neue Startzeit: ${clockTime(iso)} Uhr. Alle Zeiten werden neu berechnet.`,
        confirmLabel: 'Ändern',
      });
      if (!ok) return;
    }
    setStartTime(iso);
    void queueStartTime(iso);
    toast(`Startzeit ${clockTime(iso)} Uhr gesetzt.`);
  }

  async function clearStart() {
    const ok = await confirmDialog({
      title: 'Startzeit entfernen?',
      message: 'Ohne Startzeit nimmt der Scanner keine Zielzeiten mehr an.',
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (ok) {
      setStartTime(null);
      void queueStartTime(null);
      setTime('');
    }
  }

  const saveBackup = () => {
    const device = s.settings.deviceName ? `_${safeName(s.settings.deviceName)}` : '';
    void downloadFile(`${safeName(s.settings.eventName)}_${fileStamp()}${device}_backup.json`, createBackup(), 'application/json');
    toast('JSON-Backup gespeichert.');
  };

  async function loadBackup() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      setBackup(parseBackup(await file.text()));
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  }

  function applyBackup(mode: 'merge' | 'replace') {
    if (!backup) return;
    if (mode === 'merge') {
      const r = mergeBackup(backup);
      toast(`Zusammengeführt: ${r.newScans} neue Zielzeiten, ${r.newParticipants} neue Teilnehmer.`);
      if (r.startConflict) toast(r.startConflict, 'err');
    } else {
      replaceWithBackup(backup);
      toast('Daten aus dem Backup übernommen.');
    }
    setBackup(null);
  }

  async function confirmClearScans() {
    const ok = await confirmDialog({
      title: 'Alle Zielzeiten löschen?',
      message: `${scanCount} Zielzeiten werden gelöscht. Teilnehmer und Startzeit bleiben erhalten. Bereits hochgeladene Zeiten bleiben auf dem Server. Tipp: vorher ein Backup speichern.`,
      confirmLabel: 'Zielzeiten löschen',
      danger: true,
    });
    if (ok) {
      clearScans();
      toast('Alle Zielzeiten gelöscht.');
    }
  }

  async function confirmReset() {
    const ok = await confirmDialog({
      title: 'Alles zurücksetzen?',
      message: 'Teilnehmer, Startzeit, Zielzeiten und Einstellungen auf diesem Gerät werden gelöscht. Das kann nicht rückgängig gemacht werden.',
      confirmLabel: 'Alles löschen',
      danger: true,
    });
    if (ok) {
      resetAll();
      setTime('');
      toast('App wurde zurückgesetzt.');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Einstellungen</h1>
          <p className="page-sub">Startzeit, Veranstaltung und Datensicherung</p>
        </div>
      </div>

      {hasSaveError() && (
        <div className="banner banner-err" style={{ marginBottom: 16 }}>
          <Trash2 />
          <div className="banner-body">
            <div className="banner-title">Speichern fehlgeschlagen</div>
            <div>Der Browser-Speicher ist voll oder gesperrt. Bitte sofort ein JSON-Backup speichern.</div>
          </div>
        </div>
      )}

      <div className="settings-grid">
        {/* Startzeit */}
        <section className="card card-pad stack">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 className="card-title">Startzeit</h2>
              <p className="card-desc">Gilt für alle vier Felder (Massenstart).</p>
            </div>
            {start ? <span className="badge badge-ok">Gesetzt</span> : <span className="badge badge-warn">Fehlt</span>}
          </div>

          <div>
            <div className={`start-display${start ? '' : ' idle'}`}>{start ? `${clockTime(start)} Uhr` : '00:00:00'}</div>
            <div className="muted">{start ? dateLabel(start) : 'Noch nicht gesetzt'}</div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={startNow}>
            <Timer /> Startzeit = jetzt
          </button>

          <div className="divider" />

          <div className="grid-2">
            <label className="field">
              <span className="label">Datum</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="label">Uhrzeit (HH:MM:SS)</span>
              <input
                className="input num"
                inputMode="numeric"
                placeholder="10:00:00"
                value={time}
                onChange={(e) => setTime(maskTime(e.target.value))}
                aria-invalid={!!timeError}
              />
            </label>
          </div>
          {timeError && <p className="error-text">{timeError}</p>}
          <div className="row">
            <button className="btn" onClick={applyManual}>
              Uhrzeit übernehmen
            </button>
            {start && (
              <>
                <button className="btn" onClick={() => setShareOpen(true)}>
                  <QrIcon /> An anderes Gerät
                </button>
                <button className="btn btn-ghost" onClick={clearStart}>
                  Entfernen
                </button>
              </>
            )}
          </div>
        </section>

        <div className="stack">
          {/* Veranstaltung */}
          <section className="card card-pad stack">
            <h2 className="card-title">Veranstaltung</h2>
            <label className="field">
              <span className="label">Name der Veranstaltung</span>
              <input
                className="input"
                value={s.settings.eventName}
                onChange={(e) => updateSettings({ eventName: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && updateSettings({ eventName: 'Benefizlauf' })}
              />
            </label>
            <div>
              <div className="kv">
                <span className="muted">Ziel-Modus</span>
                <span style={{ fontWeight: 650 }}>Ein Ziel für alle Felder</span>
              </div>
              <div className="kv">
                <span className="muted">Felder</span>
                <span style={{ fontWeight: 650, textAlign: 'right' }}>3,0 km & 5,7 km · Lauf & Walk</span>
              </div>
            </div>
          </section>

          {/* Daten */}
          <section className="card card-pad stack">
            <div>
              <h2 className="card-title">Daten & Backup</h2>
              <p className="card-desc">
                {s.participants.length} Teilnehmer · {scanCount} Zielzeiten. Ohne Server-Anmeldung bleiben alle Daten nur auf diesem Gerät.
              </p>
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={saveBackup}>
                <DatabaseBackup /> Backup speichern
              </button>
              <button className="btn" onClick={loadBackup}>
                <FileUp /> Backup einlesen
              </button>
            </div>
            <p className="hint">
              Mehrere Scanner-Geräte? Auf jedem Gerät ein Backup speichern und auf dem Hauptgerät mit „Backup einlesen →
              Zusammenführen“ übernehmen. Bei doppelten Nummern zählt die früheste Zeit.
            </p>
            <button
              className="btn btn-ghost"
              style={{ justifySelf: 'start' }}
              onClick={() => downloadFile('beispiel-teilnehmer.csv', SAMPLE_CSV, 'text/csv;charset=utf-8')}
            >
              <Download /> Beispiel-CSV herunterladen
            </button>
          </section>
        </div>

        <ServerCard />

        {/* Gerät & App */}
        <section className="card card-pad stack">
          <div>
            <h2 className="card-title">Dieses Gerät</h2>
            <p className="card-desc">Der Name erscheint im Dateinamen des Backups.</p>
          </div>
          <label className="field">
            <span className="label">Gerätename</span>
            <input
              className="input"
              placeholder="z. B. Ziel 1"
              value={s.settings.deviceName}
              onChange={(e) => updateSettings({ deviceName: e.target.value })}
            />
          </label>
          <div className="kv">
            <span className="muted">Geräte-ID</span>
            <span className="num">{s.deviceId}</span>
          </div>
          <div className="divider" />
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <Smartphone style={{ flex: 'none', color: 'var(--accent)' }} />
            <div className="stack" style={{ gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Als App installieren</div>
              {install.installed ? (
                <p className="hint">Die App ist installiert und funktioniert auch ohne Internet.</p>
              ) : install.canPrompt ? (
                <button className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={install.prompt}>
                  App installieren
                </button>
              ) : install.ios ? (
                <p className="hint">
                  In Safari unten auf <strong>Teilen</strong> tippen, dann <strong>„Zum Home-Bildschirm“</strong>.
                </p>
              ) : (
                <p className="hint">
                  Im Browser-Menü <strong>„App installieren“</strong> bzw. <strong>„Zum Startbildschirm hinzufügen“</strong>{' '}
                  wählen.
                </p>
              )}
              <p className="hint">
                Wichtig: Die installierte App hat einen eigenen Speicher. Teilnehmer erst <em>in der installierten App</em>{' '}
                importieren.
              </p>
            </div>
          </div>
        </section>

        {/* Zurücksetzen */}
        <section className="card card-pad stack">
          <div>
            <h2 className="card-title">Zurücksetzen</h2>
            <p className="card-desc">Zum Beispiel nach einem Probelauf.</p>
          </div>
          <div className="row">
            <button className="btn btn-danger" onClick={confirmClearScans} disabled={!s.scans.length}>
              Zielzeiten löschen
            </button>
            <button className="btn btn-danger" onClick={confirmReset}>
              <Trash2 /> Alles löschen
            </button>
          </div>
        </section>
      </div>

      <Dialog
        open={shareOpen}
        title="Startzeit übertragen"
        onClose={() => setShareOpen(false)}
        footer={
          <button className="btn btn-primary" onClick={() => setShareOpen(false)}>
            Fertig
          </button>
        }
      >
        <p className="muted">
          Am anderen Gerät den Ziel-Scanner öffnen, Kamera starten und diesen Code scannen. Die Startzeit wird nach
          Bestätigung übernommen.
        </p>
        {start && (
          <div style={{ display: 'grid', placeItems: 'center', gap: 8, padding: '8px 0' }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 12, width: 260 }}>
              <QrCode value={`${START_QR_PREFIX}${start}`} />
            </div>
            <div className="start-display" style={{ fontSize: '1.6rem' }}>
              {clockTime(start)} Uhr
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!backup}
        title="Backup einlesen"
        onClose={() => setBackup(null)}
        footer={
          <>
            <button className="btn" onClick={() => setBackup(null)}>
              Abbrechen
            </button>
            <button className="btn btn-danger" onClick={() => applyBackup('replace')}>
              Ersetzen
            </button>
            <button className="btn btn-primary" onClick={() => applyBackup('merge')}>
              Zusammenführen
            </button>
          </>
        }
      >
        {backup && (
          <>
            <div>
              <div className="kv">
                <span className="muted">Gerät</span>
                <span>{backup.deviceName || backup.deviceId}</span>
              </div>
              <div className="kv">
                <span className="muted">Gespeichert</span>
                <span>
                  {dateLabel(backup.exportedAt)}, {clockTime(backup.exportedAt)} Uhr
                </span>
              </div>
              <div className="kv">
                <span className="muted">Inhalt</span>
                <span>
                  {backup.participants.length} Teilnehmer · {backup.scans.filter((x) => !x.deleted).length} Zielzeiten
                </span>
              </div>
            </div>
            <p className="hint">
              <strong>Zusammenführen</strong>: Zielzeiten des anderen Geräts kommen dazu, nichts geht verloren.
              <br />
              <strong>Ersetzen</strong>: Alle Daten dieses Geräts werden durch das Backup ersetzt.
            </p>
          </>
        )}
      </Dialog>
    </div>
  );
}
