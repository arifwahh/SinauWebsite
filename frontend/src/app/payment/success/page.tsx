'use client';

import React from 'react';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="card p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto">
          ✓
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Pembayaran Berhasil!</h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Terima kasih telah membeli kursus di Sinau. Silakan <strong>cek email Anda</strong> untuk
            mendapatkan tombol login ke portal belajar dan mengatur password akun Anda.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 text-left space-y-1">
          <div className="font-bold">Langkah Selanjutnya:</div>
          <p>1. Buka kotak masuk (atau folder Spam) pada email yang Anda masukkan saat checkout.</p>
          <p>2. Klik tombol <strong>Login ke Akun Sinau</strong> di dalam email tersebut.</p>
          <p>3. Pilih <strong>Login dengan Google</strong> atau <strong>Login Directly</strong> untuk mengatur password dan masuk ke dashboard.</p>
        </div>

        <div className="pt-2">
          <Link href="/" className="btn-primary inline-block w-full text-sm text-center">
            Kembali ke Katalog
          </Link>
        </div>
      </div>
    </div>
  );
}
