import { useMemo, useState } from 'react';
import { DatabaseBackup, FileSpreadsheet, Printer, Trophy } from 'lucide-react';
import { useAppState } from '../lib/store';
import { FIELDS, fieldLabel, fullName } from '../lib/fields';
import { formatDuration, fileStamp } from '../lib/time';
import { computeResults, computeTeams, resultsCsv, teamsCsv, STATUS_LABEL, type ResultRow } from '../lib/results';
import { createBackup } from '../lib/backup';
import { downloadFile, safeName } from '../lib/download';
import type { FieldId } from '../lib/types';
import { ResultDialog } from '../components/ResultDialog';
import { toast } from '../components/ui';

type Tab = FieldId | 'teams';

export function ResultsPage() {
  const s = useAppState();
  const [tab, setTab] = useState<Tab>('3.0-Lauf');
  const [selected, setSelected] = useState<{ bib: string } | null>(null);

  const results = useMemo(() => computeResults(s), [s]);
  const teams = useMemo(() => computeTeams(results), [results]);
  const base = `${safeName(s.settings.eventName)}_${fileStamp()}`;

  const selectedRow =
    selected && tab !== 'teams' ? (results[tab].find((r) => r.participant.bib === selected.bib) ?? null) : null;

  function exportCsv() {
    const isTeams = tab === 'teams';
    void downloadFile(
      `${base}_${isTeams ? 'teamwertung' : 'ergebnisse'}.csv`,
      isTeams ? teamsCsv(teams) : resultsCsv(results),
      'text/csv;charset=utf-8',
    );
    toast(isTeams ? 'Teamwertung als CSV exportiert.' : 'Ergebnisse aller Felder als CSV exportiert.');
  }

  function exportJson() {
    void downloadFile(`${base}_backup.json`, createBackup(), 'application/json');
    toast('JSON-Backup gespeichert.');
  }

  const rows = tab === 'teams' ? [] : results[tab];
  const counts = (list: ResultRow[]) => ({
    ok: list.filter((r) => r.status === 'gewertet').length,
    dnf: list.filter((r) => r.status === 'DNF').length,
    dsq: list.filter((r) => r.status === 'DSQ').length,
    dns: list.filter((r) => r.status === 'DNS').length,
  });
  const c = counts(rows);

  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <h1 className="page-title">Ergebnisse</h1>
          <p className="page-sub">Bruttozeiten, sortiert nach Zeit</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => window.print()}>
            <Printer /> Drucken
          </button>
          <button className="btn" onClick={exportJson}>
            <DatabaseBackup /> JSON-Backup
          </button>
          <button className="btn btn-primary" onClick={exportCsv}>
            <FileSpreadsheet /> CSV exportieren
          </button>
        </div>
      </div>

      <div className="chips no-print" role="tablist" style={{ marginBottom: 16 }}>
        {FIELDS.map((f) => (
          <button key={f.id} role="tab" className="chip" aria-pressed={tab === f.id} onClick={() => setTab(f.id)}>
            {f.label} <span className="count">{counts(results[f.id]).ok}</span>
          </button>
        ))}
        <button role="tab" className="chip" aria-pressed={tab === 'teams'} onClick={() => setTab('teams')}>
          <Trophy size={16} /> Teamwertung
        </button>
      </div>

      <div className="print-results">
        <h2 className="print-only">
          {s.settings.eventName} – {tab === 'teams' ? 'Teamwertung' : fieldLabel(tab)}
        </h2>

        {tab === 'teams' ? (
          <TeamTables teams={teams} />
        ) : (
          <>
            <div className="row no-print" style={{ marginBottom: 12, gap: 8 }}>
              <span className="badge badge-ok">{c.ok} gewertet</span>
              {c.dnf > 0 && <span className="badge badge-warn">{c.dnf} DNF</span>}
              {c.dsq > 0 && <span className="badge badge-err">{c.dsq} disqualifiziert</span>}
              <span className="badge">{c.dns} DNS</span>
            </div>
            {rows.length === 0 ? (
              <div className="card empty">
                <h2>Keine Teilnehmer in diesem Feld</h2>
              </div>
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Platz</th>
                      <th>Nr.</th>
                      <th>Name</th>
                      <th className="hide-sm">Team</th>
                      <th className="r">Zeit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.participant.bib} onClick={() => setSelected({ bib: r.participant.bib })}>
                        <td className="place">
                          {r.place && r.place <= 3 ? <span className={`medal-${r.place}`}>{r.place}</span> : r.place ?? '–'}
                        </td>
                        <td className="num">{r.participant.bib}</td>
                        <td>
                          <div style={{ fontWeight: 650 }}>{fullName(r.participant)}</div>
                          {r.participant.team && (
                            <div className="row-meta show-sm-only">{r.participant.team}</div>
                          )}
                        </td>
                        <td className="hide-sm muted">{r.participant.team}</td>
                        <td className="r">
                          {r.status === 'gewertet' ? (
                            <span className="time">{formatDuration(r.elapsed!)}</span>
                          ) : (
                            <span
                              className={`badge ${r.status === 'DNS' ? '' : r.status === 'DSQ' ? 'badge-err' : 'badge-warn'}`}
                            >
                              {STATUS_LABEL[r.status]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint no-print" style={{ marginTop: 10 }}>
              Tippe auf einen Eintrag, um den Status zu ändern oder die Zeit zu korrigieren. Nicht erfasste Teilnehmer
              gelten als DNS.
            </p>
          </>
        )}
      </div>

      <ResultDialog row={selectedRow} onClose={() => setSelected(null)} />
    </div>
  );
}

function TeamTables({ teams }: { teams: ReturnType<typeof computeTeams> }) {
  const any = FIELDS.some((f) => teams[f.id].length > 0);
  return (
    <div className="stack">
      <p className="hint no-print">
        Pro Feld zählen die 3 besten Zeiten eines Teams. Teams mit weniger als 3 gewerteten Läufer:innen werden nicht
        angezeigt.
      </p>
      {!any && (
        <div className="card empty">
          <div className="empty-icon">
            <Trophy />
          </div>
          <h2>Noch keine Teamwertung</h2>
          <p>Sobald ein Team in einem Feld 3 gewertete Zeiten hat, erscheint es hier.</p>
        </div>
      )}
      {FIELDS.filter((f) => teams[f.id].length > 0).map((f) => (
        <section key={f.id} className="card" style={{ overflow: 'hidden' }}>
          <div className="section-head">
            <h3 className="section-title">{f.label}</h3>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Platz</th>
                <th>Team</th>
                <th className="hide-sm">Gewertet</th>
                <th className="r">Summe</th>
              </tr>
            </thead>
            <tbody>
              {teams[f.id].map((t) => (
                <tr key={t.team} style={{ cursor: 'default' }}>
                  <td className="place">
                    {t.place <= 3 ? <span className={`medal-${t.place}`}>{t.place}</span> : t.place}
                  </td>
                  <td>
                    <div style={{ fontWeight: 650 }}>{t.team}</div>
                    <div className="row-meta" style={{ whiteSpace: 'normal' }}>
                      {t.counted.map((r) => `${fullName(r.participant)} ${formatDuration(r.elapsed!)}`).join(' · ')}
                    </div>
                  </td>
                  <td className="hide-sm muted num">
                    3 von {t.memberCount}
                  </td>
                  <td className="r">
                    <span className="time">{formatDuration(t.total)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
