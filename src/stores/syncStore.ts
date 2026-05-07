/**
 * WealthLens — Drive sync status store.
 *
 * Lightweight Zustand store that mirrors the live state of the Google Drive
 * sync layer. The sync utility (`src/utils/driveSync.ts`) writes here as it
 * progresses; UI components subscribe and render the appropriate indicator.
 *
 * Kept intentionally separate from the finance store so that:
 *  - Sync UI re-renders never invalidate dashboard subscriptions.
 *  - The sync store does NOT persist to LocalStorage — status is ephemeral
 *    per-tab/per-session, but `lastSyncedAt` is mirrored from the actual
 *    Drive metadata on next successful round-trip.
 */

import { create } from 'zustand';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface SyncState {
  status: SyncStatus;
  /** ISO 8601 timestamp of the last successful sync, or null. */
  lastSyncedAt: string | null;
  /** Human-readable error message when `status === 'error'`, else null. */
  errorMessage: string | null;

  setStatus: (status: SyncStatus, errorMessage?: string | null) => void;
  setLastSynced: (iso: string) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  errorMessage: null,

  setStatus: (status, errorMessage = null) =>
    set({
      status,
      errorMessage: status === 'error' ? errorMessage : null,
    }),

  setLastSynced: (iso) =>
    set({
      lastSyncedAt: iso,
      status: 'synced',
      errorMessage: null,
    }),

  reset: () =>
    set({
      status: 'idle',
      lastSyncedAt: null,
      errorMessage: null,
    }),
}));
