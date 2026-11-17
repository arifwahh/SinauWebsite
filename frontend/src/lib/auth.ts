import { useEffect, useState } from 'react';
import type { AuthUser, UserRole } from './types';

const ACCESS_TOKEN_KEY = 'sinau_access_token';
const REFRESH_TOKEN_KEY = 'sinau_refresh_token';
const USER_KEY = 'sinau_user';
const AUTH_CHANGE_EVENT = 'sinau-auth-change';

export const STAFF_ROLES: readonly UserRole[] = [
  'internal_instructor',
  'external_instructor',
  'curator',
  'super_admin',
];

export function isStaffRole(role?: UserRole | null): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthSession(accessToken: string, refreshToken: string, user?: AuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function useAuthUser(): { user: AuthUser | null; ready: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUser(getStoredUser());
      setReady(true);
    };
    sync();
    window.addEventListener(AUTH_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return { user, ready };
}
