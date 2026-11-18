'use client';

import React, { Suspense, useState } from 'react';
import Image from 'next/image';
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
      setError('Tautan aktivasi tidak ditemukan. Silakan buka kembali tautan dari email Anda.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi belum sama.');
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
      setError(errorMessage(err, 'Gagal menyimpan kata sandi.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[70vh] w-full flex items-center justify-center px-4 sm:px-10 py-16 overflow-hidden">
      <Image
        width={1200}
        height={1200}
        src="/image/image8.svg"
        alt="Aktivasi Akun Sinau"
        className="hidden lg:block absolute inset-0 ml-auto w-[720px] h-[680px] rounded-bl-[100px] object-cover object-center opacity-85 pointer-events-none"
      />

      <div className="container mx-auto relative z-10">
        <div className="max-w-md mx-auto lg:mx-0 lg:ml-12 rounded-xl border border-white bg-white/95 p-8 shadow-lg shadow-black/10 backdrop-blur-sm backdrop-saturate-200">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              SELAMAT! KELAS ANDA SUDAH SIAP
            </p>
            <h1 className="text-2xl font-bold text-blue-gray-900">Mulai Akses Ruang Belajar Anda</h1>
            <p className="text-sm text-gray-500 mt-1">
              Pilih cara masuk yang paling nyaman bagi Anda untuk langsung menonton materi kelas.
            </p>
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}

          {mode === 'choice' ? (
            <div className="space-y-3">
              <a
                href={GOOGLE_OAUTH_URL}
                className="btn-outline w-full gap-2"
              >
                <span>🔵</span>
                <span>Masuk Sekali Klik dengan Google</span>
              </a>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-blue-gray-100" />
                <span className="flex-shrink mx-3 text-[11px] text-gray-400 font-medium">atau</span>
                <div className="flex-grow border-t border-blue-gray-100" />
              </div>

              <button
                type="button"
                onClick={() => setMode('direct')}
                className="btn-primary w-full"
              >
                Buat Kata Sandi Akun Baru
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                  Kata Sandi Baru * <span className="text-gray-400 font-normal normal-case">(Minimal 8 karakter)</span>
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
                <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                  Ulangi Kata Sandi Baru *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru"
                  className="input-md"
                />
              </div>

              <button type="submit" disabled={loading || !token} className="btn-primary w-full">
                {loading ? 'Membuka Kelas Anda...' : 'Simpan & Mulai Belajar'}
              </button>

              <button
                type="button"
                onClick={() => setMode('choice')}
                className="w-full py-2 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900"
              >
                ← Kembali ke pilihan cara masuk
              </button>
            </form>
          )}

          <p className="text-center text-xs text-gray-500 mt-6">
            Sudah pernah membuat kata sandi?{' '}
            <Link href="/login" className="font-bold text-gray-900 underline hover:text-gray-700">
              Masuk di Sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto px-4 py-12 text-center text-sm text-gray-500">
          Menyiapkan ruang belajar Anda...
        </div>
      }
    >
      <ActivateAccountContent />
    </Suspense>
  );
}
