/**
 * WealthLens — Google OAuth provider wrapper.
 *
 * Reads `VITE_GOOGLE_CLIENT_ID` from the build-time env. If set, wraps
 * children in `<GoogleOAuthProvider>` so `useGoogleLogin` / `useGoogleAuth`
 * can do their thing. If missing, renders children unmodified and logs a
 * one-time warning — the app MUST keep working in LocalStorage-only mode
 * even with no Google credentials configured.
 *
 * NEVER throw from this component. A misconfigured env var should degrade
 * gracefully to "no cloud sync", not break the entire dashboard.
 */

import { GoogleOAuthProvider } from '@react-oauth/google';
import { type ReactNode } from 'react';

import { getGoogleClientId, isAuthConfigured } from './config';

let warned = false;
const warnOnce = (): void => {
  if (warned) return;
  warned = true;
  console.warn(
    '[WealthLens] VITE_GOOGLE_CLIENT_ID is not set — Google Drive sync is disabled.\n' +
      'To enable cloud backup:\n' +
      '  1. Create an OAuth 2.0 Client ID in Google Cloud Console (Web application).\n' +
      "  2. Add 'http://localhost:5173' to Authorized JavaScript origins.\n" +
      '  3. Copy the Client ID into .env.local as VITE_GOOGLE_CLIENT_ID=...\n' +
      '  4. Restart the dev server.',
  );
};

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps): ReactNode => {
  if (!isAuthConfigured()) {
    warnOnce();
    return children;
  }
  return (
    <GoogleOAuthProvider clientId={getGoogleClientId()}>
      {children}
    </GoogleOAuthProvider>
  );
};

export default AuthProvider;
