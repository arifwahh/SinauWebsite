'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GOOGLE_OAUTH_URL, apiFetch } from '@/lib/api';
import { isStaffRole, setAuthSession } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import type { LoginResponse } from '@/lib/types';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const DEMO_ACCOUNTS = [
  { email: 'pelajar@sinau.id', role: 'student', label: 'Pelajar (Budi)' },
  { email: 'instruktur.internal@sinau.id', role: 'internal_instructor', label: 'Instruktur Internal' },
  { email: 'instruktur.eksternal@sinau.id', role: 'external_instructor', label: 'Instruktur Eksternal' },
  { email: 'kurator@sinau.id', role: 'curator', label: 'Kurator Kursus' },
  { email: 'superadmin@sinau.id', role: 'super_admin', label: 'Super Admin' },
  { email: 'hrd.pabrik@sinau.id', role: 'b2b_admin', label: 'Admin B2B Pabrik' },
];

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get('oauth_error');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performLogin = async (loginEmail: string, loginPass: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      if (res?.data?.access_token && res?.data?.refresh_token) {
        setAuthSession(res.data.access_token, res.data.refresh_token, res.user);
        router.push(isStaffRole(res.user?.role) ? '/admin' : '/');
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Gagal masuk. Periksa email dan password Anda.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="card p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
            S
          </div>
          <h1 className="text-xl font-bold text-slate-900">Masuk ke Akun Sinau</h1>
          <p className="text-xs text-slate-500 mt-1">
            Satu sesi akun untuk Website & Aplikasi Android (FR-02)
          </p>
        </div>

        {(error || oauthError) && (
          <div className="alert-error mb-4">
            {error || `Login Google gagal (${oauthError}). Silakan coba lagi.`}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@sinau.id"
              className="input-md"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-md"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full text-sm">
            {loading ? 'Memproses...' : 'Masuk Sekarang'}
          </button>

          <a
            href={GOOGLE_OAUTH_URL}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <span>🔵</span>
            <span>Login dengan Google</span>
          </a>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-600 mb-2.5">
              Login Cepat Akun Demo (6 Role — Password: <code className="text-blue-700">password123</code>):
            </p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword('password123');
                    performLogin(acc.email, 'password123');
                  }}
                  className="text-left px-2.5 py-2 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="text-xs font-semibold text-slate-800 truncate">{acc.label}</div>
                  <div className="text-[10px] text-slate-500 truncate">{acc.email}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          Belum punya akun pelajar?{' '}
          <Link href="/register" className="font-semibold text-blue-600 hover:underline">
            Daftar Gratis di Sini
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-12 text-center text-sm text-slate-500">
          Memuat halaman login...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
