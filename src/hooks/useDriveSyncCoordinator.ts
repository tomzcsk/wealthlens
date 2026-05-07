/**
 * WealthLens — Google Drive sync coordinator hook.
 *
 * The single brain that wires together:
 *   • useGoogleAuth      → token + signed-in state
 *   • useFinanceStore    → local data + replaceAllData
 *   • useSyncStore       → status mirror for UI
 *   • driveSync utilities → load / push / debounced push
 *   • toast store        → user-facing notifications
 *
 * Mounted ONCE at the app shell (`Layout`). Never call this from a leaf — it
 * owns global side-effects (event listeners, store subscriptions) and would
 * double-fire if rendered twice.
 *
 * Returns imperative `manualSync` / `manualReload` so the Settings page can
 * trigger them on button press without re-implementing the same logic.
 *
 * Effect breakdown (lifecycle):
 *
 *   A. First-load reconciliation
 *      On sign-in (or app start while signed in): pull remote, compare via
 *      `resolveConflict`, accept the newer side. New users get an immediate
 *      push so the file exists in Drive from day one.
 *
 *   B. Auto-sync on data change
 *      Subscribes to financeStore `lastUpdated`. Every change (after init)
 *      kicks `debouncedSync` — the utility coalesces bursts into a single
 *      Drive write 2s after the last edit.
 *
 *   C. Online / offline awareness
 *      Toggles syncStore status; when coming back online with a queued
 *      pending sync, retries it.
 *
 *   D. Token expiry handling
 *      When driveSync emits TOKEN_EXPIRED_EVENT (401 from Drive), sign the
 *      user out and toast them.
 *
 *   E. Sign-out cleanup
 *      Cancel any pending debounced sync; reset syncStore to idle. The
 *      LocalStorage payload is intentionally preserved.
 */

import { useCallback, useEffect, useRef } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';
import { useFinanceStore } from '@/stores/financeStore';
import { useSyncStore } from '@/stores/syncStore';
import { useToastStore } from '@/stores/toastStore';
import {
  cancelPendingSync,
  debouncedSync,
  isOnline,
  loadFromDrive,
  resolveConflict,
  syncToDrive,
  TOKEN_EXPIRED_EVENT,
} from '@/utils/driveSync';
import type { WealthLensData } from '@/types';

/**
 * "Empty" data = no user-entered content anywhere. Initial state from a
 * fresh browser load. We need this to break a tie in conflict resolution:
 * never push an empty local payload over remote data, even if local has a
 * newer `lastUpdated` (the timestamp came from `nowIso()` at module load,
 * not from a real edit).
 */
const isDataEmpty = (data: WealthLensData): boolean => {
  for (const yr of Object.values(data.years)) {
    if (yr.income.length > 0) return false;
    if (yr.expenses.some((m) => m.items.length > 0)) return false;
    if ((yr.savings ?? []).some((m) => m.items.length > 0)) return false;
  }
  return true;
};

export interface UseDriveSyncCoordinatorResult {
  /** Force-push the current local snapshot to Drive immediately. */
  manualSync: () => Promise<void>;
  /** Force-pull from Drive and replace local data. */
  manualReload: () => Promise<void>;
}

const toast = (
  message: string,
  tone: 'success' | 'error' | 'info',
): void => {
  useToastStore.getState().push({ message, tone });
};

/**
 * Push a snapshot to Drive without going through the debounce queue.
 * Mirrors the status updates that `flushPendingSync` performs internally.
 */
const pushNow = async (
  data: WealthLensData,
  accessToken: string,
): Promise<void> => {
  const { setStatus, setLastSynced } = useSyncStore.getState();
  if (!isOnline()) {
    setStatus('offline');
    return;
  }
  setStatus('syncing');
  try {
    await syncToDrive(data, accessToken);
    setLastSynced(new Date().toISOString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    setStatus('error', message);
    throw err;
  }
};

export const useDriveSyncCoordinator = (): UseDriveSyncCoordinatorResult => {
  const { isSignedIn, accessToken, isReady, signOut } = useGoogleAuth();

  // Track "have we finished first-load reconciliation?" so the auto-sync
  // effect can skip the FIRST emission after we just replaced local data
  // with remote (which would otherwise immediately push the just-loaded
  // payload back up — wasteful and racy).
  const hasInitializedRef = useRef(false);
  // `true` for one tick after first-load applied a remote payload — used to
  // suppress the immediately-following finance-store subscription fire.
  const skipNextChangeRef = useRef(false);
  // Track the in-flight reconciliation so a second sign-in or HMR doesn't
  // double-trigger.
  const reconciliationInFlightRef = useRef(false);

  // -------------------------------------------------------------------------
  // Effect A — first-load reconciliation
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isReady || !isSignedIn || !accessToken) {
      hasInitializedRef.current = false;
      return;
    }
    if (reconciliationInFlightRef.current) return;
    if (hasInitializedRef.current) return;

    reconciliationInFlightRef.current = true;
    const { setStatus, setLastSynced } = useSyncStore.getState();
    setStatus('syncing');

    void (async () => {
      try {
        const remote = await loadFromDrive(accessToken);
        const local = useFinanceStore.getState().data;

        if (!remote) {
          // Brand-new account on Drive — but only push if local actually
          // has content. Pushing an empty initial state would seed an
          // empty file that future syncs read back as canonical "nothing".
          if (!isDataEmpty(local)) {
            await syncToDrive(local, accessToken);
          }
          setLastSynced(new Date().toISOString());
        } else {
          // CRITICAL safety net: never overwrite remote with an empty local
          // payload, even if local's `lastUpdated` looks newer. Local
          // timestamps come from `nowIso()` at store init, not real edits —
          // a fresh browser session would otherwise wipe the user's Drive
          // data before they even sign in.
          const localIsEmpty = isDataEmpty(local);
          const winner = localIsEmpty ? remote : resolveConflict(local, remote);
          if (winner === remote) {
            // Remote is newer (or local is empty); pull it down.
            skipNextChangeRef.current = true;
            useFinanceStore.getState().replaceAllData(remote);
            setLastSynced(new Date().toISOString());
            toast('ดึงข้อมูลจาก Google Drive แล้ว', 'info');
          } else {
            // Local is newer AND has content; push it up.
            await syncToDrive(local, accessToken);
            setLastSynced(new Date().toISOString());
          }
        }
        hasInitializedRef.current = true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown sync error';
        setStatus('error', message);
        toast('ซิงค์ผิดพลาด — แตะเพื่อลองใหม่', 'error');
      } finally {
        reconciliationInFlightRef.current = false;
      }
    })();
  }, [isReady, isSignedIn, accessToken]);

  // -------------------------------------------------------------------------
  // Effect B — auto-sync on data changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isSignedIn || !accessToken) return undefined;

    const unsubscribe = useFinanceStore.subscribe((state, prev) => {
      if (state.lastUpdated === prev.lastUpdated) return;
      // First emission after first-load reconciliation re-applied remote → skip.
      if (skipNextChangeRef.current) {
        skipNextChangeRef.current = false;
        return;
      }
      // Don't auto-sync until first-load has completed — otherwise we may
      // upload stale local data over a remote we haven't fetched yet.
      if (!hasInitializedRef.current) return;
      debouncedSync(state.data, accessToken);
    });

    return unsubscribe;
  }, [isSignedIn, accessToken]);

  // -------------------------------------------------------------------------
  // Effect C — online / offline awareness
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleOnline = (): void => {
      const { setStatus } = useSyncStore.getState();
      // Bounce back to syncing if we've got a session; the next data change
      // (or pending debounced flush, if any) will resolve the status.
      if (isSignedIn && accessToken && hasInitializedRef.current) {
        // Re-push current snapshot so we converge with Drive after offline edits.
        const data = useFinanceStore.getState().data;
        debouncedSync(data, accessToken);
      } else {
        setStatus('idle');
      }
    };
    const handleOffline = (): void => {
      useSyncStore.getState().setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Sync the initial offline state on mount so the badge isn't stale.
    if (!isOnline()) {
      useSyncStore.getState().setStatus('offline');
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isSignedIn, accessToken]);

  // -------------------------------------------------------------------------
  // Effect D — token expiry handling
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleExpired = (): void => {
      // useGoogleAuth itself also clears local token state on this event.
      // We additionally toast the user and sign out explicitly to be safe
      // (idempotent — clearing twice is fine).
      signOut();
      cancelPendingSync();
      useSyncStore.getState().setStatus('idle');
      toast('เซสชั่นหมดอายุ — กรุณาเข้าสู่ระบบใหม่', 'error');
    };
    window.addEventListener(TOKEN_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT, handleExpired);
  }, [signOut]);

  // -------------------------------------------------------------------------
  // Effect E — sign-out cleanup
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isSignedIn) return;
    cancelPendingSync();
    useSyncStore.getState().setStatus('idle');
    hasInitializedRef.current = false;
    skipNextChangeRef.current = false;
  }, [isSignedIn]);

  // -------------------------------------------------------------------------
  // Imperative handles for the Settings page
  // -------------------------------------------------------------------------

  const manualSync = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      toast('กรุณาเข้าสู่ระบบ Google ก่อนซิงค์', 'info');
      return;
    }
    try {
      const data = useFinanceStore.getState().data;
      await pushNow(data, accessToken);
      toast('ซิงค์ขึ้น Google Drive แล้ว', 'success');
    } catch {
      toast('ซิงค์ผิดพลาด — แตะเพื่อลองใหม่', 'error');
    }
  }, [accessToken]);

  const manualReload = useCallback(async (): Promise<void> => {
    if (!accessToken) {
      toast('กรุณาเข้าสู่ระบบ Google ก่อนคืนค่า', 'info');
      return;
    }
    const { setStatus, setLastSynced } = useSyncStore.getState();
    setStatus('syncing');
    try {
      const remote = await loadFromDrive(accessToken);
      if (!remote) {
        setStatus('synced');
        toast('ยังไม่มีข้อมูลใน Google Drive', 'info');
        return;
      }
      // Skip the auto-sync echo that this replace would trigger.
      skipNextChangeRef.current = true;
      useFinanceStore.getState().replaceAllData(remote);
      setLastSynced(new Date().toISOString());
      toast('คืนค่าจาก Google Drive แล้ว', 'success');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown sync error';
      setStatus('error', message);
      toast('ซิงค์ผิดพลาด — แตะเพื่อลองใหม่', 'error');
    }
  }, [accessToken]);

  return { manualSync, manualReload };
};

export default useDriveSyncCoordinator;
