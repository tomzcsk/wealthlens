/**
 * WealthLens — auth config helpers.
 *
 * Tiny module split out of AuthProvider so that React Fast Refresh can keep
 * working there (the lint rule `react-refresh/only-export-components`
 * requires a component file to export only components).
 */

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();

export const getGoogleClientId = (): string => CLIENT_ID;

export const isAuthConfigured = (): boolean => CLIENT_ID.length > 0;
