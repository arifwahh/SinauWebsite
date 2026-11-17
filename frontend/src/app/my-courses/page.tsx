'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { errorMessage, formatRupiah } from '@/lib/format';
import type { Certificate, Enrollment, Transaction } from '@/lib/types';

export default function MyCoursesPage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setLoading(true);
    Promise.all([
      apiFetch<{ data: Enrollment[] }>('/my-courses'),
      apiFetch<{ data: Certificate[] }>('/certificates/my'),
      apiFetch<{ data: Transaction[] }>('/transactions'),
    ])
      .then(([enrRes, certRes, txRes]) => {
        setEnrollments(enrRes.data || []);
        setCertificates(certRes.data || []);
        setTransactions(txRes.data || []);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, 'Gagal memuat data pembelajaran Anda'));
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Kursus & Sertifikat Saya</h1>
        <p className="text-xs text-slate-500 mt-1">
          Pantau progres belajar (FR-30), unduh sertifikat kelulusan (FR-34), dan lihat riwayat transaksi (FR-12).
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Bagian 1: Kursus yang Dimiliki (FR-30) */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-4">
          📚 Kursus Terdaftar ({enrollments.length})
        </h2>

        {loading ? (
          <div className="text-xs text-slate-500">Memuat daftar kursus...</div>
        ) : enrollments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-sm font-semibold text-slate-700">Anda belum memiliki kursus aktif</p>
            <Link
              href="/"
              className="inline-block mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
            >
              Jelajahi Katalog Kursus →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enrollments.map((enr) => {
              const pct = Math.min(100, Math.max(0, Number(enr.progress_percentage || 0)));
              return (
                <div
                  key={enr.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          enr.is_completed
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {enr.is_completed ? '✓ Lulus 100%' : 'Sedang Dipelajari'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(enr.enrolled_at).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-slate-900">
                      {enr.course_title || 'Kursus Sinau'}
                    </h3>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-slate-600">Progres Belajar</span>
                        <span className="text-blue-700">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            enr.is_completed ? 'bg-emerald-500' : 'bg-blue-600'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Link
                      href={`/courses/detail?id=${enr.course_id}`}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Detail Silabus
                    </Link>
                    <Link
                      href={`/learn?course_id=${enr.course_id}`}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                    >
                      {pct > 0 ? 'Lanjut Belajar →' : 'Mulai Belajar →'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bagian 2: Sertifikat Kelulusan (FR-34) */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-4">
          🎓 Sertifikat Kelulusan Saya ({certificates.length})
        </h2>

        {certificates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-xs text-slate-500">
            Sertifikat akan diterbitkan secara otomatis begitu progres belajar kursus Anda mencapai <strong>100%</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Sertifikat Terverifikasi
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-900 mt-0.5">
                    {cert.course_title}
                  </h3>
                  <div className="text-xs text-slate-600 mt-1">
                    Kode: <code className="font-mono font-bold text-slate-900">{cert.certificate_code}</code>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Diterbitkan: {new Date(cert.issued_at).toLocaleDateString('id-ID')}
                  </div>
                </div>

                <Link
                  href={`/verify?code=${cert.certificate_code}`}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 text-center"
                >
                  Lihat & Cetak →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bagian 3: Riwayat Transaksi Pembelian Satuan (FR-12) */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-4">
          🧾 Riwayat Transaksi & Invoice ({transactions.length})
        </h2>

        {transactions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-xs text-slate-500">
            Belum ada riwayat transaksi berbayar.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-3 px-4 font-bold">Order ID</th>
                    <th className="py-3 px-4 font-bold">Gateway</th>
                    <th className="py-3 px-4 font-bold">Harga</th>
                    <th className="py-3 px-4 font-bold">Diskon</th>
                    <th className="py-3 px-4 font-bold">Total Bayar</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold">Tanggal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {tx.external_transaction_id}
                      </td>
                      <td className="py-3 px-4 uppercase font-medium text-slate-600">
                        {tx.payment_gateway}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{formatRupiah(tx.amount)}</td>
                      <td className="py-3 px-4 text-emerald-700">- {formatRupiah(tx.discount)}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {formatRupiah(tx.final_amount)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                            tx.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : tx.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(tx.created_at).toLocaleDateString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
