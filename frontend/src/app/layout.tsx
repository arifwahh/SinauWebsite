import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Sinau — Platform E-Learning Satuan & Hemat Kuota',
  description:
    'Platform pembelajaran online & offline terenkripsi untuk pelajar, mahasiswa, profesional, dan pekerja industri. Beli kursus satuan sekali bayar.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="bg-white border-t border-slate-200 mt-16 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              <span className="font-semibold text-slate-800">Sinau E-Learning</span> — Dikembangkan oleh{' '}
              <span className="font-medium text-slate-700">AW More Creative</span>.
            </div>
            <div className="flex flex-wrap gap-4">
              <span>Beli Kursus Satuan (Tanpa Langganan)</span>
              <span>•</span>
              <span>Mode Video Hemat Kuota 360p</span>
              <span>•</span>
              <span>Patuh UU PDP No. 27/2022</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
