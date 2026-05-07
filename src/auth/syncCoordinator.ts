/**
 * WealthLens — sync-coordinator context (definition + consumer hook).
 *
 * Lives in its own file (separate from the React component that mounts the
 * provider) so that `react-refresh/only-export-components` is happy: the
 * companion `SyncCoordinatorContext.tsx` exports ONLY a component, while
 * this file owns the non-component context object and the
 * `useSyncCoordinator` hook used by descendants.
 */

import { createContext, useContext } from 'react';

import type { UseDriveSyncCoordinatorResult } from '@/hooks/useDriveSyncCoordinator';

export const SyncCoordinatorContext =
  createContext<UseDriveSyncCoordinatorResult | null>(null);

/**
 * Read the manual sync handles. Throws if used outside the provider so a
 * misuse fails loudly during development rather than silently no-op'ing.
 */
export const useSyncCoordinator = (): UseDriveSyncCoordinatorResult => {
  const ctx = useContext(SyncCoordinatorContext);
  if (!ctx) {
    throw new Error(
      'useSyncCoordinator must be used inside <SyncCoordinatorProvider>',
    );
  }
  return ctx;
};
