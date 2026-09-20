import { ApiError, parseProblem } from './problems';
import { parseContentDispositionFilename } from '@/lib/settings/export';

/**
 * The one place the console talks to the API (F1-DESIGN.md D2–D6).
 *
 * Written by hand rather than generated because the three things it does are specific to this backend
 * and subtle enough to deserve tests: holding the access token out of storage, refreshing exactly once
 * under concurrent failures, and round-tripping the ETag so optimistic concurrency works without every
 * screen remembering to.
 */

const API_ROOT = '/api/v1';

/**
 * The access token lives here — a module variable, never `localStorage` or a readable cookie.
 *
 * Anything a script can read is a place an XSS payload can read, and this is a bearer token. The cost is
 * that a page reload starts with no token, which is exactly what the httpOnly refresh cookie is for:
 * `bootstrapSession()` trades the cookie for a new token before the first render that needs one.
 */
let accessToken: string | null = null;

/** Set when a refresh is in flight, so concurrent callers await the same one. See `refreshOnce`. */
let inFlightRefresh: Promise<string | null> | null = null;

/** Called when the session cannot be recovered, so the app can send the operator to /login. */
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionLostSet(handler: (() => void) | null): void {
  onSessionLost = handler;
}

/**
 * Called when the API refuses a request with 503 `settings.maintenance` (Settings.md §7). Only a
 * caller without `settings.manage` ever sees this, so for them the whole console is closed — the
 * app renders a full-page notice (F5-DESIGN D7) rather than letting each screen toast the same thing.
 */
let onMaintenance: ((error: ApiError) => void) | null = null;

export function onMaintenanceSet(handler: ((error: ApiError) => void) | null): void {
  onMaintenance = handler;
}

/**
 * ETags from the last read of each resource, keyed by its path.
 *
 * Kept here rather than in each screen's state so a write cannot forget its precondition — forgetting
 * is what reintroduces last-write-wins, and the API answers a missing `If-Match` with 428 precisely so
 * the omission is loud. A screen that reads a gym and then writes it needs no plumbing of its own.
 */
const etags = new Map<string, string>();

export function rememberEtag(path: string, etag: string | null): void {
  if (etag) {
    etags.set(path, etag);
  }
}

export function knownEtag(path: string): string | undefined {
  return etags.get(path);
}

export function forgetEtags(): void {
  etags.clear();
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Send `If-Match` from the remembered ETag for this path (or an explicit rowVersion). */
  precondition?: string | true;
  /** AD-6 step-up confirmation, sent as `X-Confirm-Action`. */
  confirmation?: string;
  /**
   * AD-39, sent as `Idempotency-Key`. Mint it when the operator commits to the action, never inside
   * the request: `send` retries after a refresh, and a key regenerated per attempt would present the
   * backend with a second intent rather than a retry of the first — defeating the mechanism.
   */
  idempotencyKey?: string;
  /** Skip the refresh-and-retry dance. Used by the auth calls themselves, to avoid recursion. */
  anonymous?: boolean;
  /**
   * Return this response header instead of a body, for the endpoints whose answer IS a header.
   *
   * `POST /users/{id}/resend-invitation` and `/reset-password` reply 204 and report what actually
   * happened to the email in `X-Invitation-Email` (`sent` / `failed` / `disabled`). Discarding it let
   * the console tell an operator the message was sent while the mail server was down — and the
   * previous link had genuinely been invalidated, so the claim was not merely optimistic but
   * actively misleading.
   */
  readHeader?: string;
  signal?: AbortSignal;
}

/**
 * Refreshes the access token, at most once at a time.
 *
 * **Why single-flight matters here specifically.** The backend rotates refresh tokens and treats a
 * replayed one as an attack, revoking its whole descendant chain. So the obvious interceptor — every
 * 401 triggers a refresh — is actively harmful: three requests failing together would fire three
 * refreshes, two of them presenting a token the first has already rotated away, and reuse detection
 * would end the session. The recovery logic would be what signs the operator out.
 *
 * One promise, shared. Callers await the same result and retry once.
 */
async function refreshOnce(): Promise<string | null> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    try {
      const response = await fetch(`${API_ROOT}/auth/refresh`, {
        method: 'POST',
        // The refresh cookie is httpOnly and same-site; it rides along because the API is proxied
        // under this origin (D1). Nothing here reads or writes it.
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as { accessToken?: string };
      accessToken = body.accessToken ?? null;
      return accessToken;
    } catch {
      return null;
    } finally {
      // Cleared in `finally` so a failed refresh does not wedge every later request on a rejected
      // promise — the next 401 is allowed to try again.
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/**
 * Restores a session on app start (or full page reload) using the refresh cookie alone.
 * Returns the token, or null when there is no usable session.
 */
export async function bootstrapSession(): Promise<string | null> {
  return refreshOnce();
}

async function send(path: string, options: RequestOptions, isRetry = false): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!options.anonymous && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (options.precondition) {
    const version = options.precondition === true ? knownEtag(path) : options.precondition;
    if (version) {
      // Quoted, strong, exactly as the API issued it — a weak validator is refused with 400.
      headers['If-Match'] = version.startsWith('"') ? version : `"${version}"`;
    }
  }

  if (options.confirmation) {
    headers['X-Confirm-Action'] = options.confirmation;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  // One retry, and only after a *successful* refresh. Retrying a second time would loop, and retrying
  // a write is only safe because the retry carries the same precondition — a stale version still fails.
  if (response.status === 401 && !options.anonymous && !isRetry) {
    const token = await refreshOnce();
    if (token) {
      return send(path, options, true);
    }

    onSessionLost?.();
  }

  return response;
}

/**
 * Turns a non-2xx response into the ApiError every caller sees, and fires the two interceptions that
 * are the app's business rather than any one screen's.
 */
async function rejectWith(
  path: string,
  options: RequestOptions,
  response: Response,
): Promise<never> {
  const problem = await parseProblem(response);

  if (problem.isPreconditionDefect) {
    // The operator cannot fix this and did not cause it. Loud in the console, generic on screen.
    console.error(
      `[api] ${options.method ?? 'GET'} ${path} was sent without a usable If-Match (${problem.code}). ` +
        'A write reached the API without reading first — see lib/api/client.ts.',
    );
  }

  if (problem.isMaintenance) {
    onMaintenance?.(problem);
  }

  throw problem;
}

async function dispatch(path: string, options: RequestOptions): Promise<Response> {
  try {
    return await send(path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    // Network-level failure: no status, no problem document.
    throw new ApiError(0, undefined, undefined, true);
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await dispatch(path, options);

  if (!response.ok) {
    return rejectWith(path, options, response);
  }

  rememberEtag(path, response.headers.get('ETag'));

  if (response.status === 204) {
    // A 204 carries no body, but it can still carry an answer — see `readHeader`.
    return (options.readHeader ? response.headers.get(options.readHeader) : undefined) as T;
  }

  return (await response.json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  /** From `Content-Disposition`, or null when the server named nothing. */
  filename: string | null;
}

/**
 * A GET whose answer is a file, not JSON (`GET /audit-logs/export`).
 *
 * Goes through `send` so it carries the bearer token, retries once after a refresh and parses a
 * refusal exactly like every other call — an `<a href>` to the API would do none of those, because
 * the token lives in memory and never in a cookie (F1 D3).
 */
async function download(path: string, signal?: AbortSignal): Promise<DownloadedFile> {
  const options: RequestOptions = { signal };
  const response = await dispatch(path, options);

  if (!response.ok) {
    return rejectWith(path, options, response);
  }

  return {
    blob: await response.blob(),
    filename: parseContentDispositionFilename(response.headers.get('Content-Disposition')),
  };
}

export const api = {
  // `extra` for parity with the writes below: the activation-link check is a GET that must go out
  // *without* a bearer token, because its caller has no way to have one yet (ADR-53).
  get: <T>(
    path: string,
    signal?: AbortSignal,
    extra?: Omit<RequestOptions, 'method' | 'body' | 'signal'>,
  ) => request<T>(path, { ...extra, signal }),

  post: <T>(path: string, body?: unknown, extra?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...extra, method: 'POST', body }),

  put: <T>(path: string, body: unknown, extra?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...extra, method: 'PUT', body }),

  delete: <T>(path: string, extra?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...extra, method: 'DELETE' }),

  download,
};

/** Builds a query string, dropping empties so a cleared filter leaves no trace in the URL. */
export function query(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }

  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Test seam: resets module state between cases. */
export function __resetClientState(): void {
  accessToken = null;
  inFlightRefresh = null;
  onSessionLost = null;
  onMaintenance = null;
  etags.clear();
}
