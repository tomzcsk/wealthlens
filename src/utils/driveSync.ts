/**
 * WealthLens — Google Drive sync utility.
 *
 * Talks to the Drive REST API v3 directly via `fetch`. We deliberately avoid
 * the Google JS client library to keep the bundle tiny and side-effect free.
 *
 * Scope used: `drive.file` only — the app sees ONLY files it has created
 * (techstack §6 + CLAUDE.md). Never broaden this scope.
 *
 * Layering:
 *   • finance store (LocalStorage)  ← primary, instant
 *   • driveSync.ts (this file)      ← cloud backup, debounced 2s
 *   • syncStore.ts                  ← UI status mirror
 *
 * Public API mirrors the surface called out in features.json#F00_07.
 */

import type { WealthLensData } from '@/types';
import { useSyncStore } from '@/stores/syncStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DRIVE_FOLDER = 'WealthLens';
export const DRIVE_FILENAME = 'wealthlens_data.json';
export const SYNC_DEBOUNCE_MS = 2000;

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const JSON_MIME = 'application/json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

/** Re-export here for callers that want everything from one module. */
export type { SyncStatus } from '@/stores/syncStore';

// ---------------------------------------------------------------------------
// Auth-expiry signaling
// ---------------------------------------------------------------------------

/**
 * Custom event the auth layer listens for. Fired whenever a Drive call returns
 * 401, so the auth hook can clear its token without us importing it directly
 * (keeps this module framework-free and tree-shakeable).
 */
export const TOKEN_EXPIRED_EVENT = 'wealthlens:token-expired';

const dispatchTokenExpired = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOKEN_EXPIRED_EVENT));
  }
};

// ---------------------------------------------------------------------------
// Online detection
// ---------------------------------------------------------------------------

export const isOnline = (): boolean => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
};

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

/** Returns whichever payload has the newer `lastUpdated` ISO timestamp. */
export const resolveConflict = (
  local: WealthLensData,
  remote: WealthLensData,
): WealthLensData => {
  const localMs = Date.parse(local.lastUpdated);
  const remoteMs = Date.parse(remote.lastUpdated);
  // If either side is malformed, prefer the well-formed one.
  if (Number.isNaN(localMs) && Number.isNaN(remoteMs)) return local;
  if (Number.isNaN(localMs)) return remote;
  if (Number.isNaN(remoteMs)) return local;
  return remoteMs > localMs ? remote : local;
};

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

class HttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 120)}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries `fn` with exponential backoff. Retries on:
 *   • Network errors (fetch throws TypeError)
 *   • 5xx responses
 *   • 429 (rate limit)
 *
 * Surfaces immediately on 401 (auth) and 403 (permission). 401s also fire
 * the global `TOKEN_EXPIRED_EVENT` so the auth layer can clear the token.
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseMs = 500,
): Promise<T> => {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isHttp = err instanceof HttpError;

      if (isHttp && err.status === 401) {
        dispatchTokenExpired();
        throw err;
      }
      if (isHttp && err.status === 403) {
        throw err;
      }

      const retriable =
        !isHttp || err.status === 429 || (err.status >= 500 && err.status < 600);
      if (!retriable || attempt === maxAttempts) break;

      const delay = baseMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  throw lastErr;
};

// ---------------------------------------------------------------------------
// Low-level fetch wrapper
// ---------------------------------------------------------------------------

interface DriveFetchOptions {
  method?: string;
  accessToken: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
}

const driveFetch = async (
  url: string,
  { method = 'GET', accessToken, body = null, headers = {} }: DriveFetchOptions,
): Promise<Response> => {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(res.status, text);
  }
  return res;
};

// ---------------------------------------------------------------------------
// Folder + file lookup / creation
// ---------------------------------------------------------------------------

interface DriveFileMeta {
  id: string;
  name: string;
}

interface DriveListResponse {
  files?: DriveFileMeta[];
}

const escapeQuery = (raw: string): string => raw.replace(/'/g, "\\'");

/** Find the WealthLens folder under My Drive root, or create it. */
export const findOrCreateFolder = async (
  accessToken: string,
): Promise<string> => {
  const folderName = escapeQuery(DRIVE_FOLDER);
  const q = `name='${folderName}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;

  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    const json = (await res.json()) as DriveListResponse;
    const existing = json.files?.[0];
    if (existing?.id) return existing.id;

    // Create it.
    const createRes = await driveFetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      accessToken,
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({
        name: DRIVE_FOLDER,
        mimeType: FOLDER_MIME,
      }),
    });
    const created = (await createRes.json()) as DriveFileMeta;
    return created.id;
  });
};

/** Find the data file inside the given folder. Returns null if not present. */
export const findDataFile = async (
  accessToken: string,
  folderId: string,
): Promise<string | null> => {
  const fileName = escapeQuery(DRIVE_FILENAME);
  const folderQ = escapeQuery(folderId);
  const q = `name='${fileName}' and '${folderQ}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;

  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    const json = (await res.json()) as DriveListResponse;
    return json.files?.[0]?.id ?? null;
  });
};

// ---------------------------------------------------------------------------
// Multipart upload body
// ---------------------------------------------------------------------------

const buildMultipartBody = (
  metadata: Record<string, unknown>,
  data: WealthLensData,
  boundary: string,
): { body: string; contentType: string } => {
  const meta = JSON.stringify(metadata);
  const payload = JSON.stringify(data);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: ${JSON_MIME}; charset=UTF-8\r\n\r\n` +
    `${meta}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${JSON_MIME}; charset=UTF-8\r\n\r\n` +
    `${payload}\r\n` +
    `--${boundary}--`;
  return { body, contentType: `multipart/related; boundary=${boundary}` };
};

// ---------------------------------------------------------------------------
// Upload / download
// ---------------------------------------------------------------------------

/**
 * Upload (create or update) the data file. Returns the Drive file ID.
 * Idempotent — subsequent calls update the same file in place.
 */
export const syncToDrive = async (
  data: WealthLensData,
  accessToken: string,
): Promise<string> => {
  const folderId = await findOrCreateFolder(accessToken);
  const existingFileId = await findDataFile(accessToken, folderId);

  const boundary = `wealthlens_${Date.now().toString(36)}`;

  if (existingFileId) {
    // PATCH multipart — DON'T resend `parents` on update or Drive returns 400.
    const { body, contentType } = buildMultipartBody(
      { name: DRIVE_FILENAME, mimeType: JSON_MIME },
      data,
      boundary,
    );
    const url = `${DRIVE_UPLOAD}/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id`;
    return retryWithBackoff(async () => {
      const res = await driveFetch(url, {
        method: 'PATCH',
        accessToken,
        headers: { 'Content-Type': contentType },
        body,
      });
      const json = (await res.json()) as DriveFileMeta;
      return json.id;
    });
  }

  // Create new file inside the folder.
  const { body, contentType } = buildMultipartBody(
    { name: DRIVE_FILENAME, mimeType: JSON_MIME, parents: [folderId] },
    data,
    boundary,
  );
  const url = `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`;
  return retryWithBackoff(async () => {
    const res = await driveFetch(url, {
      method: 'POST',
      accessToken,
      headers: { 'Content-Type': contentType },
      body,
    });
    const json = (await res.json()) as DriveFileMeta;
    return json.id;
  });
};

/** Download the data file. Returns null if the file doesn't exist yet. */
export const loadFromDrive = async (
  accessToken: string,
): Promise<WealthLensData | null> => {
  const folderId = await findOrCreateFolder(accessToken);
  const fileId = await findDataFile(accessToken, folderId);
  if (!fileId) return null;

  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
  return retryWithBackoff(async () => {
    const res = await driveFetch(url, { accessToken });
    const json = (await res.json()) as WealthLensData;
    return json;
  });
};

// ---------------------------------------------------------------------------
// Debounced sync
// ---------------------------------------------------------------------------

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPayload: WealthLensData | null = null;
let pendingToken: string | null = null;

/**
 * Coalesces rapid-fire sync requests into a single Drive write.
 * Call freely from store subscriptions — only the latest payload survives.
 */
export const debouncedSync = (
  data: WealthLensData,
  accessToken: string,
): void => {
  pendingPayload = data;
  pendingToken = accessToken;

  if (pendingTimer) clearTimeout(pendingTimer);

  pendingTimer = setTimeout(() => {
    void flushPendingSync();
  }, SYNC_DEBOUNCE_MS);
};

const flushPendingSync = async (): Promise<void> => {
  const payload = pendingPayload;
  const token = pendingToken;
  pendingTimer = null;
  pendingPayload = null;
  pendingToken = null;

  if (!payload || !token) return;

  const { setStatus, setLastSynced } = useSyncStore.getState();

  if (!isOnline()) {
    setStatus('offline');
    return;
  }

  setStatus('syncing');
  try {
    await syncToDrive(payload, token);
    setLastSynced(new Date().toISOString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    setStatus('error', message);
  }
};

/** Cancel any pending debounced sync. Mostly useful for tests + sign-out. */
export const cancelPendingSync = (): void => {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pendingPayload = null;
  pendingToken = null;
};
