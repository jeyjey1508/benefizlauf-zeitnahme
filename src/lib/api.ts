// Client für die App-REST-API (Version 2.0) des Veranstalters.
// Regeln aus der Schnittstellenbeschreibung: HTTPS + JSON, snake_case, Bearer-Token außer beim Login,
// Zeitstempel in ganzen Sekunden mit Zeitzonenoffset. Tokens und Passwörter werden nie protokolliert.

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO-Zeitstempel → "2026-10-07T10:20:05+02:00" (ganze Sekunden, lokaler Offset) */
export function toApiTime(iso: string | number): string {
  const d = new Date(typeof iso === 'number' ? iso : Date.parse(iso));
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Zeitstempel vom Server lesen. "+0200" ist dasselbe wie "+02:00". */
export function fromApiTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const fixed = raw.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(fixed);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** "https://example.org/", "example.org/rest" → "https://example.org" */
export function normalizeBaseUrl(raw: string): string {
  let v = raw.trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v.replace(/\/+$/, '').replace(/\/rest$/i, '');
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fields: ApiFieldError[] = [],
    readonly retryAfter?: number,
  ) {
    super(message);
  }
  /** Session fehlt, ist abgelaufen oder ungültig → neu anmelden */
  get needsLogin() {
    return this.status === 401;
  }
  /** Kein Netz oder Server nicht erreichbar (auch CORS) */
  get offline() {
    return this.status === 0;
  }
}

function describe(status: number, code?: string, serverMsg?: string): string {
  if (code === 'invalid_credentials') return 'E-Mail oder Passwort falsch, oder der Account ist nicht aktiv.';
  if (status === 401) return 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.';
  if (status === 403) return 'Dieser Account hat keine Berechtigung für diese Veranstaltung.';
  if (status === 404) return 'Nicht gefunden. Stimmen Server-Adresse und IDs?';
  if (status === 429) return 'Zu viele Anmeldeversuche. Bitte etwas warten.';
  if (status === 400 || status === 422) return `Der Server hat die Daten abgelehnt${serverMsg ? `: ${serverMsg}` : '.'}`;
  if (status >= 500) return 'Serverfehler. Ob die Daten angekommen sind, ist unklar – einfach erneut senden.';
  return serverMsg || `Unerwartete Antwort vom Server (HTTP ${status}).`;
}

interface RequestOptions {
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(base: string, method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  if (!base) throw new ApiError('Bitte zuerst die Server-Adresse eintragen.', -1);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal ?? AbortSignal.timeout?.(20000),
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    throw new ApiError('Server nicht erreichbar. Internet prüfen (oder der Server erlaubt diese App nicht – CORS).', 0);
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; fields?: ApiFieldError[] } } | null)?.error;
    const retry = Number(res.headers.get('Retry-After'));
    throw new ApiError(
      describe(res.status, err?.code, err?.message),
      res.status,
      err?.code,
      Array.isArray(err?.fields) ? err!.fields : [],
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return data as T;
}

/* ---------------- Typen (nur die Felder, die die App braucht) ---------------- */

export interface Session {
  session_token: string;
  token_type: string;
  expires_at: string;
}

/** Felder der Events/Runs sind nicht vollständig dokumentiert → defensiv lesen */
export type ApiRecord = Record<string, unknown> & { id: number };

export interface UploadWarning {
  number: number;
  raw_value?: string;
  code: string;
}

export interface UploadResponse {
  accepted_numbers: number[];
  warnings: UploadWarning[];
}

export interface FinishTime {
  number: number;
  time: string;
  disabled: boolean;
}

export interface FinishScan {
  number: number;
  raw_value: string;
  scan_time: string;
  disabled: boolean;
}

/** Anzeigename eines Events/Runs/Users, egal wie das Feld heißt */
export function labelOf(r: Record<string, unknown> | null | undefined, fallback = ''): string {
  if (!r) return fallback;
  for (const k of ['name', 'title', 'label', 'email', 'username']) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return fallback;
}

/** Runs eines Events aus der Event-Response holen (Feldname nicht dokumentiert) */
export function runsOf(event: Record<string, unknown>): ApiRecord[] {
  for (const k of ['runs', 'run', 'races']) {
    const v = event[k];
    if (Array.isArray(v)) return v.filter((x): x is ApiRecord => !!x && typeof (x as ApiRecord).id === 'number');
  }
  return [];
}

/* ---------------- Endpoints ---------------- */

export const api = {
  login: (base: string, email: string, password: string) =>
    request<Session>(base, 'POST', '/rest/sessions', { body: { email, password } }),

  logout: (base: string, token: string) => request<void>(base, 'DELETE', '/rest/sessions/current', { token }),

  me: (base: string, token: string) => request<Record<string, unknown>>(base, 'GET', '/rest/user/me', { token }),

  events: (base: string, token: string) => request<ApiRecord[]>(base, 'GET', '/rest/event/', { token }),

  event: (base: string, token: string, id: number) => request<ApiRecord>(base, 'GET', `/rest/event/${id}`, { token }),

  run: (base: string, token: string, id: number) => request<ApiRecord>(base, 'GET', `/rest/run/${id}`, { token }),

  setStartTime: (base: string, token: string, runId: number, iso: string) =>
    request<{ run_id: number; start_time: string }>(base, 'PUT', `/rest/run/${runId}/start-time`, {
      token,
      body: { start_time: toApiTime(iso) },
    }),

  finishTimes: (base: string, token: string, eventId: number, times: FinishTime[]) =>
    request<UploadResponse>(base, 'POST', `/rest/event/${eventId}/finish-times`, { token, body: { times } }),

  finishScans: (base: string, token: string, eventId: number, scans: FinishScan[]) =>
    request<UploadResponse>(base, 'POST', `/rest/event/${eventId}/finish-scans`, { token, body: { scans } }),
};
