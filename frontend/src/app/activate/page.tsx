'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GOOGLE_OAUTH_URL, apiFetch } from '@/lib/api';
import { isStaffRole, setAuthSession } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import type { LoginResponse } from '@/lib/types';

function ActivateAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [mode, setMode] = useState<'choice' | 'direct'>('choice');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Token aktivasi tidak ditemukan di URL.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (res?.data?.access_token && res?.data?.refresh_token) {
        setAuthSession(res.data.access_token, res.data.refresh_token, res.user);
        router.push(isStaffRole(res.user?.role) ? '/admin' : '/my-courses');
      } else {
        router.push('/login');
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Gagal menyimpan password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
            S
          </div>
          <h1 className="text-xl font-bold text-slate-900">Masuk ke Akun Sinau Anda</h1>
          <p className="text-xs text-slate-500 mt-1">
            Pembelian Anda berhasil! Pilih metode login untuk mulai mengakses kursus Anda.
          </p>
        </div>

        {error && <div className="alert-error mb-4">{error}</div>}

        {mode === 'choice' ? (
          <div className="space-y-3">
            <a
              href={GOOGLE_OAUTH_URL}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center justify-center gap-2.5 shadow-sm transition-colors"
            >
              <span>🔵</span>
              <span>Login dengan Google</span>
            </a>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="flex-shrink mx-3 text-[11px] text-slate-400 font-medium">atau</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <button
              type="button"
              onClick={() => setMode('direct')}
              className="btn-primary w-full text-sm"
            >
              Login Directly (Atur Password)
            </button>
          </div>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password Baru * <span className="text-slate-400 font-normal">(8–72 karakter)</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="input-md"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Konfirmasi Password Baru *
              </label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                className="input-md"
              />
            </div>

            <button type="submit" disabled={loading || !token} className="btn-primary w-full text-sm">
              {loading ? 'Menyimpan & Masuk...' : 'Simpan & Masuk ke Dashboard'}
            </button>

            <button
              type="button"
              onClick={() => setMode('choice')}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              ← Kembali ke pilihan login
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          Sudah pernah mengatur password?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Masuk di Sini
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-12 text-center text-sm text-slate-500">
          Memuat halaman aktivasi akun...
        </div>
      }
    >
      <ActivateAccountContent />
    </Suspense>
  );
}
