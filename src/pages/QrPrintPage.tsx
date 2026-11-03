import { useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAppState } from '../lib/store';
import { FIELDS, fieldLabel, fieldOf, fullName } from '../lib/fields';
import { navigate } from '../lib/hooks';
import type { FieldId } from '../lib/types';
import { QrCode } from '../components/QrCode';

/** Druckansicht der Startnummern: Nummer groß, Name, Feld, QR (Inhalt nur die Nummer) */
export function QrPrintPage() {
  const s = useAppState();
  const [field, setField] = useState<FieldId | 'alle'>('alle');
  const list = useMemo(
    () =>
      s.participants
        .filter((p) => field === 'alle' || fieldOf(p) === field)
        .sort((a, b) => Number(a.bib) - Number(b.bib)),
    [s.participants, field],
  );

  return (
    <div className="page">
      <div className="no-print print-toolbar stack" style={{ gap: 12 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div className="row">
            <button className="btn btn-ghost btn-icon" onClick={() => navigate('teilnehmer')} aria-label="Zurück">
              <ArrowLeft />
            </button>
            <div>
              <h1 className="page-title">Startnummern drucken</h1>
              <p className="page-sub">{list.length} Karten · A4, 10 pro Seite</p>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!list.length}>
            <Printer /> Drucken
          </button>
        </div>
        <div className="chips" role="group" aria-label="Feld filtern">
          <button className="chip" aria-pressed={field === 'alle'} onClick={() => setField('alle')}>
            Alle
          </button>
          {FIELDS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={field === f.id} onClick={() => setField(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="muted">Keine Teilnehmer vorhanden.</p>
      ) : (
        <div className="bib-sheet">
          {list.map((p) => (
            <div key={p.bib} className="bib-card">
              <div style={{ minWidth: 0 }}>
                <div className="event">{s.settings.eventName}</div>
                <div className="big">{p.bib}</div>
                <div className="name">{fullName(p)}</div>
                <span className="fieldtag">{fieldLabel(fieldOf(p))}</span>
              </div>
              <QrCode className="qr" value={p.bib} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
