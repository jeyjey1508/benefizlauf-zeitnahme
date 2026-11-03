import { useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { dismissChecklist, useAppState } from '../lib/store';
import { navigate } from '../lib/hooks';
import { ScannerTestDialog } from './ScannerTestDialog';

export function Checklist() {
  const s = useAppState();
  const [testOpen, setTestOpen] = useState(false);
  if (s.checklist.dismissed) return null;

  const items = [
    { label: 'Teilnehmer importieren', done: s.participants.length > 0, action: () => navigate('teilnehmer') },
    { label: 'Startzeit setzen', done: !!s.settings.startTime, action: () => navigate('einstellungen') },
    { label: 'Scanner testen', done: s.checklist.scannerTested, action: () => setTestOpen(true) },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  return (
    <section className="card card-pad">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="card-title">{allDone ? 'Alles bereit für den Lauf' : 'Vorbereitung'}</h2>
          <p className="card-desc">
            {doneCount} von {items.length} erledigt
          </p>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={dismissChecklist} aria-label="Checkliste ausblenden">
          <X />
        </button>
      </div>
      <div className="checklist">
        {items.map((it) => (
          <button key={it.label} className={`check-item${it.done ? ' done' : ''}`} onClick={it.action}>
            <span className="check-box">{it.done && <Check size={18} strokeWidth={3} />}</span>
            <span className="check-label">{it.label}</span>
            <ChevronRight className="chev" size={20} />
          </button>
        ))}
      </div>
      <ScannerTestDialog open={testOpen} onClose={() => setTestOpen(false)} />
    </section>
  );
}
