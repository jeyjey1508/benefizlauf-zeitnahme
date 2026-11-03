import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog, confirmDialog, toast } from './ui';
import { deleteParticipant, saveParticipant } from '../lib/store';
import { FIELDS, fieldOf, fullName, normalizeBib } from '../lib/fields';
import type { FieldId, Participant } from '../lib/types';

interface Props {
  open: boolean;
  participant: Participant | null; // null = neu anlegen
  onClose: () => void;
}

export function ParticipantDialog({ open, participant, onClose }: Props) {
  const [bib, setBib] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [field, setField] = useState<FieldId>('3.0-Lauf');
  const [team, setTeam] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBib(participant?.bib ?? '');
    setFirstName(participant?.firstName ?? '');
    setLastName(participant?.lastName ?? '');
    setField(participant ? fieldOf(participant) : '3.0-Lauf');
    setTeam(participant?.team ?? '');
    setError(null);
  }, [open, participant]);

  function save() {
    const nb = normalizeBib(bib);
    if (!nb) return setError('Bitte eine Startnummer aus Ziffern eingeben (max. 6 Stellen).');
    if (!firstName.trim() && !lastName.trim()) return setError('Bitte einen Namen eingeben.');
    const f = FIELDS.find((x) => x.id === field)!;
    const err = saveParticipant(
      {
        bib: nb,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        distance: f.distance,
        discipline: f.discipline,
        team: team.trim(),
        status: participant?.status ?? 'auto',
      },
      participant?.bib,
    );
    if (err) return setError(err);
    toast(participant ? 'Änderungen gespeichert.' : `Nr. ${nb} angelegt.`);
    onClose();
  }

  async function remove() {
    if (!participant) return;
    const ok = await confirmDialog({
      title: 'Teilnehmer löschen?',
      message: `Nr. ${participant.bib} · ${fullName(participant)} wird mit allen Zielzeiten gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (ok) {
      deleteParticipant(participant.bib);
      toast('Teilnehmer gelöscht.');
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      title={participant ? `Nr. ${participant.bib} bearbeiten` : 'Teilnehmer anlegen'}
      onClose={onClose}
      footer={
        <>
          {participant && (
            <button className="btn btn-danger" onClick={remove}>
              <Trash2 /> Löschen
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <form
        className="stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span className="label">Startnummer</span>
          <input className="input num" inputMode="numeric" value={bib} onChange={(e) => setBib(e.target.value)} autoFocus />
        </label>
        <div className="grid-2">
          <label className="field">
            <span className="label">Vorname</span>
            <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Nachname</span>
            <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span className="label">Feld</span>
          <div className="seg" style={{ gridAutoFlow: 'row', gridTemplateColumns: '1fr 1fr' }}>
            {FIELDS.map((f) => (
              <button type="button" key={f.id} aria-pressed={field === f.id} onClick={() => setField(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">Team (optional)</span>
          <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="z. B. Klasse 7b" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button hidden />
      </form>
    </Dialog>
  );
}
