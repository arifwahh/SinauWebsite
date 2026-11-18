'use client';

import React, { Suspense, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GOOGLE_OAUTH_URL, apiFetch } from '@/lib/api';
import { isStaffRole, setAuthSession } from '@/lib/auth';
import { errorMessage } from '@/lib/format';
import type { LoginResponse } from '@/lib/types';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const DEMO_ACCOUNTS = [
  { email: 'pelajar@sinau.id', role: 'student', label: 'Member Pelajar (Budi)' },
  { email: 'instruktur.internal@sinau.id', role: 'internal_instructor', label: 'Mentor Internal' },
  { email: 'instruktur.eksternal@sinau.id', role: 'external_instructor', label: 'Mentor Praktisi' },
  { email: 'kurator@sinau.id', role: 'curator', label: 'Tim Kurator Kelas' },
  { email: 'superadmin@sinau.id', role: 'super_admin', label: 'Pengelola Utama' },
  { email: 'hrd.pabrik@sinau.id', role: 'b2b_admin', label: 'Mitra Perusahaan' },
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
      setError(errorMessage(err, 'Gagal masuk. Periksa kembali email dan kata sandi Anda.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLogin(email, password);
  };

  return (
    <div className="relative min-h-[75vh] w-full flex items-center justify-center px-4 sm:px-10 py-16 overflow-hidden">
      <Image
        width={1200}
        height={1200}
        src="/image/image8.svg"
        alt="Ruang Belajar Sinau"
        className="hidden lg:block absolute inset-0 ml-auto w-[720px] h-[680px] rounded-bl-[100px] object-cover object-center opacity-85 pointer-events-none"
      />

      <div className="container mx-auto relative z-10">
        <div className="max-w-md mx-auto lg:mx-0 lg:ml-12 rounded-xl border border-white bg-white/95 p-8 shadow-lg shadow-black/10 backdrop-blur-sm backdrop-saturate-200">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              SELAMAT DATANG KEMBALI DI SINAU
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-gray-900">
              Lanjutkan Perjalanan Belajar Anda
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Masuk untuk mengakses seluruh kelas, progres materi, dan sertifikat kelulusan Anda.
            </p>
          </div>

          {(error || oauthError) && (
            <div className="alert-error mb-4">
              {error || `Belum berhasil masuk dengan Google. Silakan coba kembali.`}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                Alamat Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="input-md"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-md"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Membuka Ruang Belajar...' : 'Masuk ke Ruang Belajar'}
            </button>

            <a
              href={GOOGLE_OAUTH_URL}
              className="btn-outline w-full gap-2"
            >
              <span>🔵</span>
              <span>Masuk Praktis dengan Google</span>
            </a>
          </form>

          {DEMO_MODE && (
            <div className="mt-6 pt-5 border-t border-blue-gray-100">
              <p className="text-xs font-bold text-blue-gray-800 mb-2.5">
                Coba Langsung Akun Contoh (Kata Sandi: <code className="text-gray-900 underline">password123</code>):
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
                    className="text-left px-3 py-2 rounded-lg border border-blue-gray-100 hover:border-gray-900 hover:bg-blue-gray-50/50 transition-all"
                  >
                    <div className="text-xs font-bold text-blue-gray-900 truncate">{acc.label}</div>
                    <div className="text-[10px] text-gray-500 truncate">{acc.email}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-xs text-gray-500 mt-6">
            Baru pertama kali di Sinau?{' '}
            <Link href="/register" className="font-bold text-gray-900 underline hover:text-gray-700">
              Buat Akun Gratis Sekarang
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-12 text-center text-sm text-gray-500">
          Menyiapkan halaman masuk...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
