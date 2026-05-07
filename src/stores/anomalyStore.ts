/**
 * WealthLens — anomaly dismissal store (F15).
 *
 * Tracks which anomaly fingerprints (`${year}-${month}-${category}`) Tom
 * has explicitly dismissed in the UI. Persisted under its own LocalStorage
 * key so the finance dataset (and Drive sync) stay untouched — dismissals
 * are a UI preference, not part of the financial ledger.
 *
 * Implementation note: `Set` is not JSON-serialisable, so the on-disk
 * shape is `string[]`. We rehydrate to a `Set` via the persist middleware's
 * `partialize` / `merge` hooks so the in-memory API stays Set-shaped.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORAGE_KEY = 'wealthlens_anomaly_dismissals';
const STORAGE_VERSION = 1;

export interface AnomalyState {
  dismissed: Set<string>;
  dismiss: (fingerprint: string) => void;
  undismiss: (fingerprint: string) => void;
  reset: () => void;
}

interface PersistedShape {
  dismissed: string[];
}

export const useAnomalyStore = create<AnomalyState>()(
  persist(
    (set) => ({
      dismissed: new Set<string>(),

      dismiss: (fingerprint) =>
        set((state) => {
          if (state.dismissed.has(fingerprint)) return state;
          const next = new Set(state.dismissed);
          next.add(fingerprint);
          return { dismissed: next };
        }),

      undismiss: (fingerprint) =>
        set((state) => {
          if (!state.dismissed.has(fingerprint)) return state;
          const next = new Set(state.dismissed);
          next.delete(fingerprint);
          return { dismissed: next };
        }),

      reset: () => set({ dismissed: new Set<string>() }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      // Only the dismissed list is persisted — actions are recreated on
      // hydration. Serialise Set ↔ array because JSON.stringify would
      // otherwise emit `{}` for a Set instance.
      partialize: (state): PersistedShape => ({
        dismissed: Array.from(state.dismissed),
      }),
      merge: (persisted, current): AnomalyState => {
        const incoming = (persisted as PersistedShape | undefined)?.dismissed ?? [];
        return {
          ...current,
          dismissed: new Set(incoming),
        };
      },
    },
  ),
);
