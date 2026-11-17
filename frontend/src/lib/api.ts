// Sinau API Client — mendukung JWT Bearer Token + Auto-Refresh Token Rotation (NFR-05)

import { clearAuthSession, getAccessToken, getRefreshToken, setAuthSession } from './auth';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

export const GOOGLE_OAUTH_URL = `${API_BASE_URL}/auth/google`;

export function resolveMediaUrl(url: string): string {
  if (!url.startsWith('/')) return url;
  const origin = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  return `${origin}${url}`;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        clearAuthSession();
        return false;
      }
      const json = await res.json();
      if (json?.data?.access_token && json?.data?.refresh_token) {
        setAuthSession(json.data.access_token, json.data.refresh_token);
        return true;
      }
      clearAuthSession();
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401 && retryOn401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/refresh')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = getAccessToken();
      if (newToken) {
        headers.set('Authorization', `Bearer ${newToken}`);
      }
      return apiFetch<T>(endpoint, { ...options, headers }, false);
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.error || data?.message || `Request gagal (HTTP ${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}
