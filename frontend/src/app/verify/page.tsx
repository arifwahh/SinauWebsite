'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import type { Certificate } from '@/lib/types';

function VerifyCertificateContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') || '';

  const [code, setCode] = useState(initialCode);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyCode = useCallback(async (targetCode: string) => {
    const clean = targetCode.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setCert(null);
    try {
      const res = await apiFetch<{ is_valid: boolean; data: Certificate }>(
        `/certificates/verify/${encodeURIComponent(clean)}`
      );
      setCert(res.data);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Sertifikat tidak ditemukan atau kode tidak valid.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) {
      verifyCode(initialCode);
    }
  }, [initialCode, verifyCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCode(code);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8 print:max-w-none print:p-0 print:m-0 print:space-y-0">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm print:hidden">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
          Verifikasi Keaslian Sertifikat Publik (FR-34)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Masukkan nomor seri / kode sertifikat Sinau untuk memeriksa validitas kelulusan peserta secara terbuka.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Contoh: CERT-SINAU-A1B2C3D4E5F6"
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold shadow-sm"
          >
            {loading ? 'Memeriksa...' : 'Cek Keaslian'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
            ❌ {error}
          </div>
        )}
      </div>

      {/* Kartu Sertifikat Resmi Jika Valid */}
      {cert && (
        <div className="space-y-5 print:space-y-0">
          <div className="relative bg-gradient-to-br from-slate-50 via-white to-blue-50/40 rounded-2xl p-3 sm:p-4 shadow-xl border border-slate-200 print:shadow-none print:rounded-none print:border-0 print:p-0">
            {/* Bingkai Luar & Dalam */}
            <div className="relative border-[6px] border-double border-blue-900 rounded-xl p-6 sm:p-10 overflow-hidden bg-white">
              {/* Garis Aksen Emas */}
              <div className="pointer-events-none absolute inset-2 border border-amber-400/70 rounded-lg" />

              {/* Sudut Dekoratif */}
              <div className="pointer-events-none absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-amber-500" />
              <div className="pointer-events-none absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-amber-500" />
              <div className="pointer-events-none absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-amber-500" />
              <div className="pointer-events-none absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-amber-500" />

              {/* Watermark Latar */}
              <div className="pointer-events-none select-none absolute inset-0 flex items-center justify-center opacity-[0.035]">
                <span className="text-[110px] sm:text-[150px] font-black tracking-widest text-blue-900 -rotate-12">
                  SINAU
                </span>
              </div>

              <div className="relative z-10 text-center">
                {/* Header Brand & Lencana */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center font-black text-xl shadow-sm">
                      S
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-extrabold tracking-wide text-blue-950 uppercase">
                        Sinau E-Learning
                      </div>
                      <div className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
                        AW More Creative
                      </div>
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 text-[11px] font-extrabold mb-4">
                    <span>✓ SERTIFIKAT ASLI &amp; TERVERIFIKASI</span>
                  </div>

                  <div className="text-xs sm:text-sm font-bold uppercase tracking-[0.28em] text-amber-600">
                    Sertifikat Kelulusan
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-blue-950 tracking-wide mt-1">
                    CERTIFICATE OF COMPLETION
                  </h2>
                </div>

                {/* Nama Penerima */}
                <p className="text-xs sm:text-sm text-slate-500 mt-6">
                  Dengan bangga diberikan kepada:
                </p>
                <div className="mt-2 inline-block border-b-2 border-amber-400 pb-1.5 px-6">
                  <h3 className="text-2xl sm:text-4xl font-serif font-extrabold text-slate-900">
                    {cert.student_name || 'Pelajar Sinau'}
                  </h3>
                </div>

                {/* Judul Kursus */}
                <p className="text-xs sm:text-sm text-slate-500 mt-6 max-w-xl mx-auto">
                  Atas keberhasilan menyelesaikan seluruh materi pembelajaran, evaluasi, dan persyaratan kelulusan pada kursus:
                </p>
                <h4 className="text-lg sm:text-2xl font-extrabold text-blue-800 mt-2 max-w-2xl mx-auto">
                  {cert.course_title}
                </h4>

                {/* Footer Tanda Tangan & Metadata */}
                <div className="mt-10 pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-6 items-end text-xs text-slate-600">
                  <div className="sm:text-left">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Tanggal Terbit
                    </div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {new Date(cert.issued_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center">
                    <div className="w-14 h-14 rounded-full border-2 border-amber-500 bg-amber-50 flex flex-col items-center justify-center text-amber-700 shadow-inner">
                      <span className="text-[9px] font-black tracking-widest uppercase">SINAU</span>
                      <span className="text-base leading-none font-bold">★</span>
                      <span className="text-[8px] font-bold uppercase">VERIFIED</span>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      Kode Verifikasi Resmi
                    </div>
                    <code className="font-mono font-bold text-blue-900 mt-0.5 inline-block">
                      {cert.certificate_code}
                    </code>
                    <div className="text-[10px] text-slate-400 mt-2">
                      Disahkan secara digital oleh <strong className="text-slate-700">Sinau Academy</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm"
            >
              🖨️ Cetak / Simpan sebagai PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyCertificatePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
          Memuat halaman verifikasi...
        </div>
      }
    >
      <VerifyCertificateContent />
    </Suspense>
  );
}
