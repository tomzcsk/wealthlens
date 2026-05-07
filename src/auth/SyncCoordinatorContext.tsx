/**
 * WealthLens — sync-coordinator provider component.
 *
 * Lifts the `manualSync` / `manualReload` handles returned by
 * `useDriveSyncCoordinator` (mounted ONCE at the Layout root) into a React
 * context so descendants — most importantly the Settings page — can call
 * them without re-mounting the coordinator.
 *
 * Why a context (not a Zustand store)?
 *  • The hook returns imperative async functions that close over the live
 *    access token and store snapshot. They aren't serialisable state and
 *    never need to trigger a re-render — context is the natural fit.
 *  • Consumers calling `useSyncCoordinator()` outside the provider get a
 *    clear runtime error; that's the bug-prevention guarantee context
 *    gives us, vs. silently returning a stub.
 *
 * The context object and the `useSyncCoordinator` hook live in
 * `./syncCoordinator.ts` so this file can stay component-only (required by
 * `react-refresh/only-export-components`).
 */

import { type ReactNode } from 'react';

import type { UseDriveSyncCoordinatorResult } from '@/hooks/useDriveSyncCoordinator';

import { SyncCoordinatorContext } from './syncCoordinator';

export interface SyncCoordinatorProviderProps {
  value: UseDriveSyncCoordinatorResult;
  children: ReactNode;
}

export const SyncCoordinatorProvider = ({
  value,
  children,
}: SyncCoordinatorProviderProps): ReactNode => (
  <SyncCoordinatorContext.Provider value={value}>
    {children}
  </SyncCoordinatorContext.Provider>
);

export default SyncCoordinatorProvider;
