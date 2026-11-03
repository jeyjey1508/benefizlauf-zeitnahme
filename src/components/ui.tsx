import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

/* ---------------- Dialog ---------------- */

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2 className="dialog-title">{title}</h2>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Schließen">
              <X />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/* ---------------- Bestätigen ---------------- */

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

let openConfirm: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

export const confirmDialog = (o: ConfirmOptions) => openConfirm?.(o) ?? Promise.resolve(window.confirm(o.title));

export function ConfirmHost() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  useEffect(() => {
    openConfirm = (o) => new Promise((resolve) => setState({ ...o, resolve }));
    return () => {
      openConfirm = null;
    };
  }, []);
  const done = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <Dialog
      open={!!state}
      title={state?.title ?? ''}
      onClose={() => done(false)}
      footer={
        <>
          <button className="btn" onClick={() => done(false)}>
            Abbrechen
          </button>
          <button className={`btn ${state?.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => done(true)}>
            {state?.confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{state?.message}</div>
    </Dialog>
  );
}

/* ---------------- Hinweise (Toast) ---------------- */

type ToastKind = 'ok' | 'err';
interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

let pushToast: ((t: ToastItem) => void) | null = null;
let nextId = 1;

export const toast = (text: string, kind: ToastKind = 'ok') => pushToast?.({ id: nextId++, text, kind });

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      setItems((list) => [...list, t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.kind === 'err' ? 6000 : 3500);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.kind === 'ok' ? <CheckCircle2 /> : <AlertCircle />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Datei wählen ---------------- */

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
