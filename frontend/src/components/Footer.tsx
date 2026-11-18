'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const LINKS = [
  {
    title: 'Tentang Sinau',
    items: [
      { label: 'Kenapa Memilih Sinau?', href: '/#about' },
      { label: 'Katalog Kelas Pilihan', href: '/#explore-courses' },
      { label: 'Jalur Karier & Kategori', href: '/#categories' },
      { label: 'Workshop & Live Event', href: '/#events' },
    ],
  },
  {
    title: 'Akses Cepat',
    items: [
      { label: 'Masuk ke Akun', href: '/login' },
      { label: 'Daftar Member Baru', href: '/register' },
      { label: 'Cek Keaslian Sertifikat', href: '/verify' },
      { label: 'Ruang Belajar Saya', href: '/my-courses' },
    ],
  },
  {
    title: 'Keunggulan Kami',
    items: [
      { label: 'Sekali Bayar Selamanya', href: '/#explore-courses' },
      { label: 'Video Jernih Hemat Kuota', href: '/#explore-courses' },
      { label: 'Sertifikat Resmi Siap Kerja', href: '/verify' },
      { label: 'Bisa Belajar Tanpa Sinyal', href: '/#explore-courses' },
    ],
  },
];

const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <footer className="px-8 pt-24 pb-8 print:hidden bg-white">
      <div className="container max-w-6xl flex flex-col mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 !w-full">
          <div className="flex flex-wrap col-span-2 items-start gap-10 mb-10 lg:mb-0 md:gap-24">
            {LINKS.map(({ title, items }) => (
              <ul key={title}>
                <h6 className="block antialiased tracking-normal font-sans text-base font-semibold leading-relaxed text-blue-gray-900 mb-4">
                  {title}
                </h6>
                {items.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="block antialiased font-sans text-base leading-relaxed py-1 font-normal !text-gray-700 transition-colors hover:!text-gray-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <div>
            <h6 className="block antialiased tracking-normal font-sans text-base font-semibold leading-relaxed text-blue-gray-900 mb-3 text-left">
              Info Promo &amp; Beasiswa Kelas
            </h6>
            <p className="block antialiased font-sans !text-gray-500 font-normal mb-4 text-base leading-relaxed">
              Dapatkan voucher diskon spesial dan tips peningkatan karier gratis langsung di email Anda setiap minggu.
            </p>
            <p className="block antialiased font-sans text-sm leading-normal font-medium mb-2 text-left text-blue-gray-900">
              Alamat Email Anda
            </p>
            <form
              onSubmit={handleSubscribe}
              className="flex mb-3 flex-col lg:flex-row items-start gap-4"
            >
              <div className="w-full">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Masukkan email aktif..."
                  className="w-full h-11 px-3 py-2.5 rounded-[7px] border border-blue-gray-200 bg-transparent text-sm text-blue-gray-700 font-normal outline-none focus:border-2 focus:border-gray-900 transition-all"
                />
                {subscribed ? (
                  <p className="font-medium mt-3 !text-sm text-emerald-700 text-left">
                    Terima kasih! Anda telah terdaftar untuk menerima info promo Sinau.
                  </p>
                ) : (
                  <p className="block antialiased font-sans font-medium mt-3 !text-sm !text-gray-500 text-left">
                    Dengan mendaftar, saya menyetujui{' '}
                    <Link
                      href="/#explore-courses"
                      className="font-bold underline hover:text-gray-900 transition-colors"
                    >
                      Syarat &amp; Ketentuan Privasi
                    </Link>
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg bg-gray-900 text-white shadow-md shadow-gray-900/10 hover:shadow-lg hover:shadow-gray-900/20 w-full lg:w-fit shrink-0"
              >
                Langganan
              </button>
            </form>
          </div>
        </div>
        <p className="block antialiased font-sans text-base leading-relaxed text-blue-gray-900 md:text-center mt-16 font-normal !text-gray-700">
          &copy; {CURRENT_YEAR} <span className="font-semibold text-gray-900">Sinau</span> — Tempat Belajar Keahlian Praktis untuk Karier &amp; Masa Depan Anda. Dipersembahkan oleh <span className="font-semibold text-gray-900">AW More Creative</span>.
        </p>
      </div>
    </footer>
  );
}

export default Footer;
