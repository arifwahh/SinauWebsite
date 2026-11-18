'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
      setSuccess('Pendaftaran berhasil! Mengarahkan Anda ke halaman masuk...');
      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Pendaftaran belum berhasil. Mohon periksa kembali data Anda.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[75vh] w-full flex items-center justify-center px-4 sm:px-10 py-16 overflow-hidden">
      <Image
        width={1200}
        height={1200}
        src="/image/image8.svg"
        alt="Mulai Belajar di Sinau"
        className="hidden lg:block absolute inset-0 ml-auto w-[720px] h-[680px] rounded-bl-[100px] object-cover object-center opacity-85 pointer-events-none"
      />

      <div className="container mx-auto relative z-10">
        <div className="max-w-md mx-auto lg:mx-0 lg:ml-12 rounded-xl border border-white bg-white/95 p-8 shadow-lg shadow-black/10 backdrop-blur-sm backdrop-saturate-200">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              LANGKAH AWAL KARIER IMPIAN
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-gray-900">
              Mulai Belajar di Sinau Sekarang
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Daftar gratis dalam 1 menit dan pilih kelas keahlian yang paling Anda butuhkan.
            </p>
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}
          {success && <div className="alert-success mb-4">{success}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                Nama Lengkap <span className="text-gray-400 font-normal normal-case">(Tercantum di Sertifikat)</span> *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="input-md"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                Alamat Email Aktif *
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
                Nomor WhatsApp / HP
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08123456789"
                className="input-md"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                Tanggal Lahir * <span className="text-gray-400 font-normal normal-case">(Terbuka mulai usia 13 tahun)</span>
              </label>
              <input
                type="date"
                required
                max={maxBirthDate}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="input-md"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                Buat Kata Sandi * <span className="text-gray-400 font-normal normal-case">(Minimal 8 karakter)</span>
              </label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="input-md"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Menyiapkan Akun Anda...' : 'Daftar & Mulai Belajar'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-6">
            Sudah memiliki akun Sinau?{' '}
            <Link href="/login" className="font-bold text-gray-900 underline hover:text-gray-700">
              Masuk di Sini
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
