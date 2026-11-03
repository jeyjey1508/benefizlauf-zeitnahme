import { useState } from 'react';
import { Camera, Keyboard } from 'lucide-react';
import { Dialog } from './ui';
import { CameraScanner } from './CameraScanner';
import { getState, markScannerTested } from '../lib/store';
import { fieldLabel, fieldOf, fullName, normalizeBib } from '../lib/fields';
import { feedbackSuccess, feedbackWarning, unlockAudio } from '../lib/feedback';

/** Probescan: zeigt nur an, was erkannt wurde – speichert nichts */
export function ScannerTestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'kamera' | 'manuell'>('kamera');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const check = (raw: string) => {
    unlockAudio();
    const bib = normalizeBib(raw);
    const p = bib ? getState().participants.find((x) => x.bib === bib) : undefined;
    markScannerTested();
    if (p) {
      feedbackSuccess();
      setResult({ ok: true, text: `Nr. ${p.bib} · ${fullName(p)} · ${fieldLabel(fieldOf(p))}` });
    } else {
      feedbackWarning();
      setResult({ ok: false, text: bib ? `Nr. ${bib} erkannt – nicht in der Teilnehmerliste` : `Erkannt: "${raw}"` });
    }
  };

  return (
    <Dialog
      open={open}
      title="Scanner testen"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Fertig
        </button>
      }
    >
      <p className="muted">Probescan – es wird nichts gespeichert. Halte einen Startnummern-QR-Code vor die Kamera.</p>
      <div className="seg" role="group" aria-label="Eingabeart">
        <button aria-pressed={mode === 'kamera'} onClick={() => setMode('kamera')}>
          <Camera size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          Kamera
        </button>
        <button aria-pressed={mode === 'manuell'} onClick={() => setMode('manuell')}>
          <Keyboard size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          Eingabe
        </button>
      </div>
      {open && mode === 'kamera' && <CameraScanner onDetect={check} />}
      {mode === 'manuell' && (
        <form
          className="entry"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) check(value);
            setValue('');
          }}
        >
          <input
            className="input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Nr."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Startnummer"
          />
          <button className="btn btn-primary">Prüfen</button>
        </form>
      )}
      {result && (
        <div className={`banner ${result.ok ? 'banner-info' : 'banner-warn'}`}>
          <div className="banner-body">
            <div className="banner-title">{result.ok ? 'Scanner funktioniert' : 'Code gelesen'}</div>
            <div>{result.text}</div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
