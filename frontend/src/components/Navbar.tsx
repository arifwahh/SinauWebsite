'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuthSession, getRefreshToken, isStaffRole, useAuthUser } from '@/lib/auth';
import { getRoleLabel } from '@/lib/format';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthUser();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refresh }),
        });
      } catch {
        // Abaikan jika token sudah dicabut
      }
    }
    clearAuthSession();
    router.push('/login');
  };

  const navLinks = [
    { href: '/', label: 'Katalog Kursus', show: true },
    { href: '/my-courses', label: 'Kursus & Sertifikat Saya', show: !!user },
    { href: '/verify', label: 'Verifikasi Sertifikat', show: true },
    { href: '/admin', label: 'Dashboard Panel', show: isStaffRole(user?.role), accent: true },
  ].filter((item) => item.show);

  const navLinkClass = (path: string) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      pathname === path
        ? 'bg-blue-50 text-blue-700 font-semibold'
        : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              S
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 tracking-tight">Sinau</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Hemat Kuota
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((item) => (
              <Link key={item.href} href={item.href} className={navLinkClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-800">{user.full_name}</div>
                <div className="text-xs text-blue-600 font-medium">{getRoleLabel(user.role)}</div>
              </div>
              <button
                onClick={handleLogout}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
              >
                Keluar
              </button>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Masuk
              </Link>
              <Link href="/register" className="btn-primary text-sm py-2">
                Daftar Akun
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Toggle Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`block py-2 text-sm ${
                item.accent ? 'font-semibold text-blue-600' : 'font-medium text-slate-700'
              }`}
            >
              {item.accent && user ? `${item.label} (${getRoleLabel(user.role)})` : item.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-slate-100">
            {user ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{user.full_name}</div>
                  <div className="text-xs text-blue-600">{getRoleLabel(user.role)}</div>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50"
                >
                  Keluar
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 text-center py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-700"
                >
                  Masuk
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="flex-1 text-center py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white"
                >
                  Daftar
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
