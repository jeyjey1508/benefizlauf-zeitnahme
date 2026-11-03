import { useEffect, useState } from 'react';

export type Route = 'ziel' | 'teilnehmer' | 'qr' | 'ergebnisse' | 'einstellungen';
const ROUTES: Route[] = ['ziel', 'teilnehmer', 'qr', 'ergebnisse', 'einstellungen'];

const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'ziel';
};

export const navigate = (r: Route) => {
  location.hash = `/${r}`;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Aktuelle Zeit, aktualisiert im angegebenen Takt */
export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Bildschirm wach halten, solange die Komponente sichtbar ist */
export function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let sentinel: Sentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === 'visible')
        wl.request('screen')
          .then((s) => (sentinel = s))
          .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

/** Lokale Einstellung (nur Komfort, z. B. Kamera an/aus) */
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`pref.${key}`);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(`pref.${key}`, JSON.stringify(nv));
    } catch {
      /* egal */
    }
  };
  return [v, set];
}

export const START_QR_PREFIX = 'BENEFIZLAUF-START:';
