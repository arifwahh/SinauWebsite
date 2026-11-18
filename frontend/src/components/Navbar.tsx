'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearAuthSession, getRefreshToken, isStaffRole, useAuthUser } from '@/lib/auth';
import { getRoleLabel } from '@/lib/format';

function RectangleStackIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M5.566 4.657A4.505 4.505 0 016.75 4.5h10.5c.41 0 .806.055 1.183.157A3 3 0 0015.75 3h-7.5a3 3 0 00-2.684 1.657zM2.25 12a3 3 0 013-3h13.5a3 3 0 013 3v6a3 3 0 01-3 3H5.25a3 3 0 01-3-3v-6zM5.25 7.5c-.41 0-.806.055-1.184.157A3 3 0 016.75 6h10.5a3 3 0 012.683 1.657A4.505 4.505 0 0018.75 7.5H5.25z" />
    </svg>
  );
}

function UserCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CommandLineIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M2.25 6a3 3 0 013-3h13.5a3 3 0 013 3v12a3 3 0 01-3 3H5.25a3 3 0 01-3-3V6zm3.97.97a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 01-1.06-1.06l1.72-1.72-1.72-1.72a.75.75 0 010-1.06zm4.28 4.28a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Squares2X2Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.75 0a3 3 0 013-3H18a3 3 0 013 3v2.25a3 3 0 01-3 3h-2.25a3 3 0 01-3-3V6zM3 15.75a3 3 0 013-3h2.25a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-2.25zm9.75 0a3 3 0 013-3H18a3 3 0 013 3V18a3 3 0 01-3 3h-2.25a3 3 0 01-3-3v-2.25z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 960) setOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  const navMenu = [
    {
      name: 'Eksplor Kelas',
      href: '/#explore-courses',
      icon: RectangleStackIcon,
      show: true,
    },
    {
      name: user ? 'Kelas Saya' : 'Ruang Belajar',
      href: user ? '/my-courses' : '/login',
      icon: UserCircleIcon,
      show: true,
    },
    {
      name: 'Cek Sertifikat',
      href: '/verify',
      icon: CommandLineIcon,
      show: true,
    },
    {
      name: 'Panel Pengelola',
      href: '/admin',
      icon: Squares2X2Icon,
      show: isStaffRole(user?.role),
    },
  ].filter((item) => item.show);

  return (
    <div className="px-4 sm:px-10 sticky top-4 z-50 print:hidden">
      <div className="mx-auto container">
        <nav className="block w-full max-w-screen-2xl rounded-xl bg-white/80 backdrop-blur-2xl backdrop-saturate-200 text-white shadow-md z-50 mt-6 relative border-0 pr-3 py-3 pl-6">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="block antialiased font-sans text-blue-gray-900 text-lg font-bold tracking-normal"
            >
              Sinau
            </Link>

            <ul className="ml-10 hidden items-center gap-8 lg:flex">
              {navMenu.map(({ name, icon: Icon, href }) => {
                const active = pathname === href;
                return (
                  <li key={name}>
                    <Link
                      href={href}
                      className={`antialiased font-sans text-base leading-relaxed flex items-center gap-2 font-medium transition-colors ${
                        active ? 'text-gray-900 font-bold' : 'text-gray-900 hover:text-gray-600'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden items-center gap-4 lg:flex">
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-bold text-blue-gray-900">{user.full_name}</div>
                    <div className="text-xs text-gray-500 font-medium">{getRoleLabel(user.role)}</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg bg-gray-900 text-white shadow-md shadow-gray-900/10 hover:shadow-lg hover:shadow-gray-900/20"
                  >
                    Keluar
                  </button>
                </div>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg text-gray-900 hover:bg-gray-900/10 active:bg-gray-900/20"
                  >
                    Masuk
                  </Link>
                  <Link
                    href="/register"
                    className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg bg-gray-900 text-white shadow-md shadow-gray-900/10 hover:shadow-lg hover:shadow-gray-900/20"
                  >
                    Mulai Belajar
                  </Link>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpen((cur) => !cur)}
              aria-label="Toggle Menu"
              className="relative align-middle select-none font-sans font-medium text-center uppercase transition-all w-10 max-w-[40px] h-10 max-h-[40px] rounded-lg text-xs text-gray-900 hover:bg-gray-900/10 active:bg-gray-900/20 ml-auto inline-flex items-center justify-center lg:hidden"
            >
              {open ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-6 w-6"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>
          </div>

          {open && (
            <div className="container mx-auto mt-3 border-t border-gray-200 px-2 pt-4">
              <ul className="flex flex-col gap-4">
                {navMenu.map(({ name, icon: Icon, href }) => (
                  <li key={name}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className="antialiased font-sans text-base leading-relaxed flex items-center gap-2 font-medium text-gray-900"
                    >
                      <Icon className="h-5 w-5" />
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-6 mb-4 flex items-center gap-4">
                {user ? (
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-blue-gray-900">{user.full_name}</div>
                      <div className="text-xs text-gray-500">{getRoleLabel(user.role)}</div>
                    </div>
                    <button
                      onClick={() => {
                        setOpen(false);
                        handleLogout();
                      }}
                      className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-2.5 px-5 rounded-lg bg-gray-900 text-white shadow-md shadow-gray-900/10"
                    >
                      Keluar
                    </button>
                  </div>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg text-gray-900 hover:bg-gray-900/10"
                    >
                      Masuk
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setOpen(false)}
                      className="align-middle select-none font-sans font-bold text-center uppercase transition-all text-xs py-3 px-6 rounded-lg bg-gray-900 text-white shadow-md shadow-gray-900/10"
                    >
                      Mulai Belajar
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
