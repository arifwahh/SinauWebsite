'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { isStaffRole, setAuthSession } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import type { AuthUser } from '@/lib/types';

export default function GoogleOAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      setError('Token login Google tidak ditemukan.');
      return;
    }

    apiFetch<{ data: AuthUser }>('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        setAuthSession(accessToken, refreshToken, res.data);
        router.replace(isStaffRole(res.data?.role) ? '/admin' : '/my-courses');
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, 'Gagal menyelesaikan login Google.'));
      });
  }, [router]);

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="card p-8 space-y-4">
        {error ? (
          <>
            <div className="alert-error">{error}</div>
            <Link href="/login" className="btn-primary inline-block text-xs">
              ← Kembali ke Halaman Login
            </Link>
          </>
        ) : (
          <p className="text-sm font-semibold text-slate-700">
            Menyelesaikan login dengan Google, mengarahkan ke dashboard...
          </p>
        )}
      </div>
    </div>
  );
}
