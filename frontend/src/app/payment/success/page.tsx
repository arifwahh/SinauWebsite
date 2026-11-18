'use client';

import React from 'react';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-20">
      <div className="card p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-3xl mx-auto shadow-md">
          ✓
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
            SELAMAT BERGABUNG DI SINAU!
          </p>
          <h1 className="text-2xl font-bold text-blue-gray-900">Kelas Anda Sudah Aktif!</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Terima kasih telah berinvestasi untuk masa depan Anda bersama Sinau. Silakan <strong className="text-gray-900">buka email Anda sekarang</strong> untuk langsung masuk ke ruang belajar.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-blue-gray-50/70 border border-blue-gray-100 text-xs text-blue-gray-800 text-left space-y-1.5">
          <div className="font-bold uppercase tracking-wider text-blue-gray-900">3 Langkah Mudah Mulai Belajar:</div>
          <p>1. Buka kotak masuk (atau folder Promosi/Spam) pada email yang Anda gunakan saat pembelian.</p>
          <p>2. Klik tombol <strong>Masuk ke Ruang Belajar Sinau</strong> di dalam email tersebut.</p>
          <p>3. Pilih masuk instan dengan Google atau atur kata sandi Anda, dan seluruh materi kelas langsung terbuka!</p>
        </div>

        <div className="pt-2">
          <Link href="/" className="btn-primary w-full">
            Lihat Pilihan Kelas Lainnya
          </Link>
        </div>
      </div>
    </div>
  );
}
