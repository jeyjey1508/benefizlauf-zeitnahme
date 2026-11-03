import { useEffect, useState } from 'react';
import { Dialog, confirmDialog, toast } from './ui';
import { getState, setManualTime, setParticipantStatus } from '../lib/store';
import { fieldLabel, fieldOf, fullName } from '../lib/fields';
import { clockTime, formatDuration, parseDuration } from '../lib/time';
import type { ManualStatus } from '../lib/types';
import type { ResultRow } from '../lib/results';

const STATUS_OPTIONS: { value: ManualStatus; label: string }[] = [
  { value: 'auto', label: 'Automatisch' },
  { value: 'DNF', label: 'DNF' },
  { value: 'DSQ', label: 'Disq.' },
  { value: 'DNS', label: 'DNS' },
];

/** Einzelnes Ergebnis: Status setzen, Zeit korrigieren */
export function ResultDialog({ row, onClose }: { row: ResultRow | null; onClose: () => void }) {
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const p = row?.participant;

  useEffect(() => {
    setTime(row?.elapsed !== undefined ? formatDuration(row.elapsed) : '');
    setError(null);
  }, [row]);

  function saveTime() {
    if (!p) return;
    if (!getState().settings.startTime) return setError('Zuerst die Startzeit setzen.');
    const sec = parseDuration(time);
    if (sec === null) return setError('Bitte im Format HH:MM:SS eingeben, z. B. 00:24:13.');
    setManualTime(p.bib, sec);
    toast(`Zeit für Nr. ${p.bib} gespeichert.`);
    onClose();
  }

  async function removeTime() {
    if (!p) return;
    const ok = await confirmDialog({
      title: 'Zielzeit löschen?',
      message: `Nr. ${p.bib} gilt danach als nicht im Ziel (DNS).`,
      confirmLabel: 'Zeit löschen',
      danger: true,
    });
    if (ok) {
      setManualTime(p.bib, null);
      toast('Zielzeit gelöscht.');
      onClose();
    }
  }

  return (
    <Dialog
      open={!!row}
      title={p ? `Nr. ${p.bib} · ${fullName(p)}` : ''}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Fertig
        </button>
      }
    >
      {p && row && (
        <>
          <p className="muted">
            {fieldLabel(fieldOf(p))}
            {p.team && ` · ${p.team}`}
            {row.scan && ` · Ziel um ${clockTime(row.scan.ts)} Uhr (${row.scan.source})`}
          </p>

          <div className="field">
            <span className="label">Status</span>
            <div className="seg">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  aria-pressed={p.status === o.value}
                  onClick={() => {
                    setParticipantStatus(p.bib, o.value);
                    onClose();
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <span className="hint">Automatisch: gewertet, wenn im Ziel erfasst – sonst DNS.</span>
          </div>

          <div className="divider" />

          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              saveTime();
            }}
          >
            <span className="label">Bruttozeit korrigieren</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                className="input num"
                inputMode="numeric"
                placeholder="HH:MM:SS"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={!!error}
              />
              <button className="btn">Speichern</button>
            </div>
            {error && <span className="error-text">{error}</span>}
          </form>
          {row.scan && (
            <button className="btn btn-danger" onClick={removeTime}>
              Zielzeit löschen
            </button>
          )}
        </>
      )}
    </Dialog>
  );
}
