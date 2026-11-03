import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Dialog, toast } from './ui';
import { getState, importParticipants } from '../lib/store';
import { parseParticipantsCsv } from '../lib/csv';
import { FIELDS, fieldOf } from '../lib/fields';

interface Props {
  text: string | null;
  fileName: string;
  onClose: () => void;
}

/** Vorschau und Prüfung vor dem Teilnehmer-Import */
export function ImportDialog({ text, fileName, onClose }: Props) {
  const hasExisting = getState().participants.length > 0;
  const [replace, setReplace] = useState(true);

  const result = useMemo(() => {
    if (text === null) return null;
    const existing = replace ? new Set<string>() : new Set(getState().participants.map((p) => p.bib));
    return parseParticipantsCsv(text, existing);
  }, [text, replace]);

  const n = result?.participants.length ?? 0;

  function apply() {
    if (!result) return;
    importParticipants(result.participants, replace || !hasExisting);
    toast(`${n} Teilnehmer importiert.`);
    onClose();
  }

  return (
    <Dialog
      open={text !== null}
      title="Teilnehmer importieren"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={!n}>
            {n} Teilnehmer importieren
          </button>
        </>
      }
    >
      <p className="muted">{fileName}</p>
      {result?.fatal ? (
        <div className="banner banner-err">
          <AlertTriangle />
          <div className="banner-body">
            <div className="banner-title">Datei kann nicht gelesen werden</div>
            <div>{result.fatal}</div>
            <div className="hint" style={{ marginTop: 6 }}>
              Benötigte Spalten: startnummer, vorname, nachname, strecke, disziplin, team
            </div>
          </div>
        </div>
      ) : (
        result && (
          <>
            <div className="banner banner-info">
              <CheckCircle2 />
              <div className="banner-body">
                <div className="banner-title">{n} gültige Einträge</div>
                <div className="hint">
                  {FIELDS.map((f) => `${f.short}: ${result.participants.filter((p) => fieldOf(p) === f.id).length}`).join(' · ')}
                </div>
              </div>
            </div>
            {(result.errors.length > 0 || result.warnings.length > 0) && (
              <div className="banner banner-warn">
                <AlertTriangle />
                <div className="banner-body">
                  <div className="banner-title">
                    {result.errors.length > 0
                      ? `${result.errors.length} Zeile${result.errors.length === 1 ? '' : 'n'} werden übersprungen`
                      : 'Hinweise'}
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
                    {result.errors.map((e) => (
                      <li key={e.line}>
                        Zeile {e.line}: {e.message}
                      </li>
                    ))}
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {hasExisting && (
              <div className="field">
                <span className="label">Vorhandene Teilnehmerliste</span>
                <div className="seg">
                  <button aria-pressed={replace} onClick={() => setReplace(true)}>
                    Ersetzen
                  </button>
                  <button aria-pressed={!replace} onClick={() => setReplace(false)}>
                    Ergänzen
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </Dialog>
  );
}
