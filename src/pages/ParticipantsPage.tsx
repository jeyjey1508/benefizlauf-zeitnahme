import { useMemo, useState } from 'react';
import { Download, FileUp, Plus, QrCode, Search, Users } from 'lucide-react';
import { firstScans, useAppState } from '../lib/store';
import { FIELDS, fieldOf, fullName } from '../lib/fields';
import { SAMPLE_CSV } from '../lib/csv';
import { downloadFile } from '../lib/download';
import { navigate } from '../lib/hooks';
import type { FieldId, Participant } from '../lib/types';
import { pickFile } from '../components/ui';
import { ImportDialog } from '../components/ImportDialog';
import { ParticipantDialog } from '../components/ParticipantDialog';

export function ParticipantsPage() {
  const s = useAppState();
  const [query, setQuery] = useState('');
  const [field, setField] = useState<FieldId | 'alle'>('alle');
  const [editing, setEditing] = useState<Participant | null | undefined>(undefined); // undefined = zu
  const [importData, setImportData] = useState<{ text: string; name: string } | null>(null);

  const scanned = useMemo(() => firstScans(s.scans), [s.scans]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.participants
      .filter((p) => field === 'alle' || fieldOf(p) === field)
      .filter((p) => !q || `${p.bib} ${p.firstName} ${p.lastName} ${p.team}`.toLowerCase().includes(q))
      .sort((a, b) => Number(a.bib) - Number(b.bib));
  }, [s.participants, query, field]);

  async function importFile() {
    const file = await pickFile('.csv,text/csv,text/plain');
    if (file) setImportData({ text: await file.text(), name: file.name });
  }

  const downloadSample = () => downloadFile('beispiel-teilnehmer.csv', SAMPLE_CSV, 'text/csv;charset=utf-8');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Teilnehmer</h1>
          <p className="page-sub">{s.participants.length} angemeldet</p>
        </div>
        {s.participants.length > 0 && (
          <div className="row">
            <button className="btn" onClick={() => navigate('qr')}>
              <QrCode /> QR-Codes drucken
            </button>
            <button className="btn" onClick={importFile}>
              <FileUp /> CSV importieren
            </button>
            <button className="btn btn-primary" onClick={() => setEditing(null)}>
              <Plus /> Neu
            </button>
          </div>
        )}
      </div>

      {s.participants.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <Users />
          </div>
          <h2>Noch keine Teilnehmer</h2>
          <p>
            Importiere eine CSV-Datei mit den Spalten startnummer, vorname, nachname, strecke (3.0 / 5.7), disziplin
            (Lauf / Walk) und team.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={importFile}>
              <FileUp /> CSV importieren
            </button>
            <button className="btn btn-lg" onClick={() => setEditing(null)}>
              <Plus /> Einzeln anlegen
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={downloadSample}>
              <Download /> Beispiel-CSV herunterladen
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setImportData({ text: SAMPLE_CSV, name: 'Beispieldaten (12 erfundene Teilnehmer)' })}
            >
              Beispieldaten zum Testen laden
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="stack" style={{ gap: 10 }}>
            <label className="field" style={{ position: 'relative' }}>
              <span className="sr-only">Suchen</span>
              <Search
                size={20}
                style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)', pointerEvents: 'none' }}
              />
              <input
                className="input"
                style={{ paddingLeft: 44 }}
                placeholder="Name, Nummer oder Team suchen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="chips" role="group" aria-label="Feld filtern">
              <button className="chip" aria-pressed={field === 'alle'} onClick={() => setField('alle')}>
                Alle <span className="count">{s.participants.length}</span>
              </button>
              {FIELDS.map((f) => (
                <button key={f.id} className="chip" aria-pressed={field === f.id} onClick={() => setField(f.id)}>
                  {f.label}{' '}
                  <span className="count">{s.participants.filter((p) => fieldOf(p) === f.id).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card list">
            {list.length === 0 && (
              <p className="muted" style={{ padding: 20 }}>
                Keine Treffer.
              </p>
            )}
            {list.map((p) => (
              <button key={p.bib} className="list-row" onClick={() => setEditing(p)}>
                <span className="bib">{p.bib}</span>
                <span className="row-main">
                  <span className="row-name" style={{ display: 'block' }}>
                    {fullName(p)}
                  </span>
                  <span className="row-meta" style={{ display: 'block' }}>
                    {FIELDS.find((f) => f.id === fieldOf(p))!.label}
                    {p.team && ` · ${p.team}`}
                  </span>
                </span>
                {scanned.has(p.bib) ? (
                  <span className="badge badge-ok">Im Ziel</span>
                ) : p.status !== 'auto' ? (
                  <span className="badge badge-warn">{p.status === 'DSQ' ? 'Disq.' : p.status}</span>
                ) : (
                  <span />
                )}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn btn-ghost" onClick={downloadSample}>
              <Download /> Beispiel-CSV herunterladen
            </button>
          </div>
        </div>
      )}

      <ParticipantDialog open={editing !== undefined} participant={editing ?? null} onClose={() => setEditing(undefined)} />
      <ImportDialog text={importData?.text ?? null} fileName={importData?.name ?? ''} onClose={() => setImportData(null)} />
    </div>
  );
}
