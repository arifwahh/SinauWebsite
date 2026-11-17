'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { errorMessage, getMaxBirthDate } from '@/lib/format';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const maxBirthDate = getMaxBirthDate(13);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone,
          birth_date: birthDate,
          password,
        }),
      });
      setSuccess('Registrasi berhasil! Mengalihkan ke halaman login...');
      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Registrasi gagal. Periksa kembali data Anda.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-3 shadow-sm">
            S
          </div>
          <h1 className="text-xl font-bold text-slate-900">Daftar Akun Pelajar Baru</h1>
          <p className="text-xs text-slate-500 mt-1">
            Mulai belajar keterampilan baru dengan kursus satuan hemat kuota
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: Budi Santoso"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor HP / WhatsApp</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08123456789"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Lahir * <span className="text-slate-400 font-normal">(Minimal usia 13 tahun — NFR-06)</span>
            </label>
            <input
              type="date"
              required
              max={maxBirthDate}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password * <span className="text-slate-400 font-normal">(8–72 karakter)</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm shadow-sm transition-colors"
          >
            {loading ? 'Mendaftarkan Akun...' : 'Buat Akun Pelajar'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Sudah punya akun?{' '}
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Masuk di Sini
          </Link>
        </p>
      </div>
    </div>
  );
}
