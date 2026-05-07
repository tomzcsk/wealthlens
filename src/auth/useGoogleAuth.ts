/**
 * WealthLens — Google auth hook.
 *
 * Wraps `useGoogleLogin` (implicit flow, scope = drive.file ONLY) and exposes
 * a tiny stable surface to the rest of the app:
 *
 *     const { isSignedIn, accessToken, user, signIn, signOut, isReady } =
 *         useGoogleAuth();
 *
 * Persists the access token + user profile to LocalStorage under the key
 * `wealthlens_auth` so a page refresh keeps the session alive (within the
 * ~1-hour token TTL). When any Drive call returns 401, it dispatches a
 * `wealthlens:token-expired` event (see `driveSync.ts`); we listen for that
 * and clear the session, flipping `isSignedIn` to false.
 *
 * Implementation note — why two hooks:
 *   `useGoogleLogin` from @react-oauth/google internally calls
 *   `useGoogleOAuth()` which throws if no `<GoogleOAuthProvider>` is in the
 *   tree. When `VITE_GOOGLE_CLIENT_ID` is unset we deliberately do NOT mount
 *   the provider (it would still try to load the GSI script). So we expose
 *   `useGoogleAuth` as a thin selector that picks the configured or stub
 *   implementation at module load — `isAuthConfigured()` is derived from the
 *   build-time env, constant for the whole session, so React's "rules of
 *   hooks" stay intact (we always call the same hook within a given build).
 */

import { useGoogleLogin, type TokenResponse } from '@react-oauth/google';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { isAuthConfigured } from './config';
import { TOKEN_EXPIRED_EVENT } from '@/utils/driveSync';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const STORAGE_KEY = 'wealthlens_auth';

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
}

interface PersistedAuth {
  accessToken: string;
  user: GoogleUser;
  /** ms epoch when the token expires, used as a soft client-side check. */
  expiresAt: number;
}

const readPersistedAuth = (): PersistedAuth | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAuth;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      !parsed.user
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writePersistedAuth = (value: PersistedAuth): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const clearPersistedAuth = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
};

interface UserInfoResponse {
  name: string;
  email: string;
  picture: string;
}

const fetchUserInfo = async (accessToken: string): Promise<GoogleUser> => {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status}`);
  }
  const json = (await res.json()) as UserInfoResponse;
  return {
    name: json.name ?? '',
    email: json.email ?? '',
    picture: json.picture ?? '',
  };
};

export interface UseGoogleAuthResult {
  isSignedIn: boolean;
  accessToken: string | null;
  user: GoogleUser | null;
  signIn: () => void;
  signOut: () => void;
  /** True only when `VITE_GOOGLE_CLIENT_ID` is configured. */
  isReady: boolean;
}

// ---------------------------------------------------------------------------
// Token-expiry listener (shared by both implementations)
// ---------------------------------------------------------------------------

const useTokenExpiryListener = (onExpire: () => void): void => {
  useEffect(() => {
    window.addEventListener(TOKEN_EXPIRED_EVENT, onExpire);
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT, onExpire);
  }, [onExpire]);
};

// ---------------------------------------------------------------------------
// Configured implementation — talks to Google
// ---------------------------------------------------------------------------

const useConfiguredAuth = (): UseGoogleAuthResult => {
  const [accessToken, setAccessToken] = useState<string | null>(
    () => readPersistedAuth()?.accessToken ?? null,
  );
  const [user, setUser] = useState<GoogleUser | null>(
    () => readPersistedAuth()?.user ?? null,
  );

  const handleExpire = useCallback(() => {
    clearPersistedAuth();
    setAccessToken(null);
    setUser(null);
  }, []);
  useTokenExpiryListener(handleExpire);

  const realLogin = useGoogleLogin({
    flow: 'implicit',
    scope: SCOPE,
    onSuccess: async (
      tokenResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>,
    ) => {
      try {
        const profile = await fetchUserInfo(tokenResponse.access_token);
        const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
        writePersistedAuth({
          accessToken: tokenResponse.access_token,
          user: profile,
          expiresAt,
        });
        setAccessToken(tokenResponse.access_token);
        setUser(profile);
      } catch (err) {
        console.error('[WealthLens] failed to fetch Google profile', err);
      }
    },
    onError: (err) => {
      console.error('[WealthLens] Google sign-in error', err);
    },
  });

  const signIn = useCallback(() => realLogin(), [realLogin]);
  const signOut = useCallback(() => {
    clearPersistedAuth();
    setAccessToken(null);
    setUser(null);
  }, []);

  return useMemo<UseGoogleAuthResult>(
    () => ({
      isSignedIn: Boolean(accessToken),
      accessToken,
      user,
      signIn,
      signOut,
      isReady: true,
    }),
    [accessToken, user, signIn, signOut],
  );
};

// ---------------------------------------------------------------------------
// Stub implementation — when no Client ID is configured
// ---------------------------------------------------------------------------

const useStubAuth = (): UseGoogleAuthResult => {
  const handleExpire = useCallback(() => {
    /* no-op: nothing to clear */
  }, []);
  useTokenExpiryListener(handleExpire);

  const noop = useCallback(() => {}, []);

  return useMemo<UseGoogleAuthResult>(
    () => ({
      isSignedIn: false,
      accessToken: null,
      user: null,
      signIn: noop,
      signOut: noop,
      isReady: false,
    }),
    [noop],
  );
};

// ---------------------------------------------------------------------------
// Public hook
// ---------------------------------------------------------------------------

/**
 * Picks the configured or stub implementation at module load. The choice is
 * fixed for the lifetime of the build (it depends on `import.meta.env`), so
 * React's rules of hooks are not violated — every render of any given
 * component always calls the same underlying hook in the same order.
 */
export const useGoogleAuth: () => UseGoogleAuthResult = isAuthConfigured()
  ? useConfiguredAuth
  : useStubAuth;

export default useGoogleAuth;
