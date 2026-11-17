'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { LEVEL_LABELS, errorMessage, formatPrice, getLevelLabel } from '@/lib/format';
import type { Category, Course } from '@/lib/types';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function HomeCatalogContent() {
  const searchParams = useSearchParams();
  const [paymentFailed, setPaymentFailed] = useState(false);

  useEffect(() => {
    if (searchParams.get('payment') === 'failed') {
      setPaymentFailed(true);
    }
  }, [searchParams]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States (FR-20)
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [level, setLevel] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('');

  // Debounce input teks/angka agar tidak menembak API setiap ketikan (H4)
  const [debouncedFilter, setDebouncedFilter] = useState({ search: '', minPrice: '', maxPrice: '' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilter({ search: search.trim(), minPrice, maxPrice });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, minPrice, maxPrice]);

  useEffect(() => {
    apiFetch<{ data: Category[] }>('/categories')
      .then((res) => setCategories(res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedFilter.search) params.set('q', debouncedFilter.search);
    if (categoryId > 0) params.set('category_id', String(categoryId));
    if (level) params.set('level', level);
    if (debouncedFilter.minPrice !== '') params.set('min_price', debouncedFilter.minPrice);
    if (debouncedFilter.maxPrice !== '') params.set('max_price', debouncedFilter.maxPrice);
    if (minRating !== '') params.set('min_rating', minRating);

    const queryStr = params.toString();
    apiFetch<{ data: Course[] }>(`/courses${queryStr ? `?${queryStr}` : ''}`, {
      signal: controller.signal,
    })
      .then((res) => setCourses(res.data || []))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'Gagal memuat katalog kursus'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedFilter, categoryId, level, minRating]);

  const handleResetFilter = () => {
    setSearch('');
    setCategoryId(0);
    setLevel('');
    setMinPrice('');
    setMaxPrice('');
    setMinRating('');
  };

  const getCategoryName = (catId?: number | null) => {
    if (!catId) return 'Umum';
    return categories.find((c) => c.id === catId)?.name || 'Kursus';
  };

  return (
    <div>
      {paymentFailed && (
        <div className="bg-red-600 text-white text-xs sm:text-sm font-semibold px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <span>
              ❌ Pembayaran gagal atau dibatalkan. Silakan pilih kursus dan coba lakukan pembayaran kembali.
            </span>
            <button
              type="button"
              onClick={() => setPaymentFailed(false)}
              className="underline font-bold shrink-0"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-blue-700 via-blue-800 to-slate-900 text-white py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-100 text-xs font-medium mb-4">
              <span>⚡ Ringan & Hemat Kuota (360p)</span>
              <span>•</span>
              <span>🔒 Download Video Offline AES-256 di Android</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              Tingkatkan Keterampilan Kerja & Teknologi dengan Kursus Satuan
            </h1>
            <p className="mt-3 text-sm sm:text-base text-blue-100 leading-relaxed">
              Beli kursus secara satuan sekali bayar tanpa biaya langganan bulanan. Dilengkapi materi Video HLS adaptif,
              Artikel, PDF, Kuis Interaktif, dan Sertifikat Kelulusan ber-kode verifikasi publik.
            </p>
            {DEMO_MODE && (
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-blue-100">
                <span className="px-3 py-1.5 rounded-lg bg-white/10 font-medium">
                  🎟️ Promo Voucher: <strong className="text-amber-300">HEMAT50</strong> (Diskon 50%)
                </span>
                <span className="px-3 py-1.5 rounded-lg bg-white/10 font-medium">
                  🎓 Voucher Beasiswa: <strong className="text-emerald-300">BEASISWA100</strong> (Gratis 100%)
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Filter & Katalog (FR-20) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-slate-900">Filter & Pencarian Katalog Kursus</h2>
            <button
              type="button"
              onClick={handleResetFilter}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 self-start sm:self-auto"
            >
              Reset Semua Filter
            </button>
          </div>

          {/* Pil Kategori Cepat */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={() => setCategoryId(0)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                categoryId === 0
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Semua Kategori
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryId(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  categoryId === cat.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Grid Input Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kata Kunci (q)</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul / topik..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tingkat Kesulitan</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="input"
              >
                <option value="">Semua Level</option>
                {Object.entries(LEVEL_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Harga Minimum (Rp)</label>
              <input
                type="number"
                min={0}
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Harga Maksimum (Rp)</label>
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Contoh: 200000"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rating Minimal</label>
              <select
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Rating</option>
                <option value="4.5">⭐ 4.5 ke atas</option>
                <option value="4">⭐ 4.0 ke atas</option>
                <option value="3">⭐ 3.0 ke atas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Status Error / Loading */}
        {error && (
          <div className="alert-error mb-6 text-sm p-4">
            {error} — Pastikan layanan backend sedang aktif dan dapat dihubungi.
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-slate-200 p-5 h-72 animate-pulse flex flex-col justify-between"
              >
                <div>
                  <div className="h-4 w-28 bg-slate-200 rounded mb-3" />
                  <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
                  <div className="h-4 w-full bg-slate-100 rounded" />
                </div>
                <div className="h-10 w-full bg-slate-200 rounded-xl" />
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-base font-semibold text-slate-700">Tidak ada kursus yang sesuai filter</p>
            <p className="text-xs text-slate-500 mt-1">
              Coba ubah kata kunci pencarian atau tekan tombol Reset Semua Filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div
                key={course.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                <div className="h-36 bg-gradient-to-r from-blue-600 to-indigo-700 p-5 flex flex-col justify-between text-white relative">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/20 backdrop-blur-sm">
                      {getCategoryName(course.category_id)}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-900/40">
                      {getLevelLabel(course.level)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <span>★ {Number(course.rating_avg || 0).toFixed(1)}</span>
                    <span className="text-blue-100 font-normal">({course.total_reviews} ulasan)</span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 line-clamp-2">{course.title}</h3>
                    {course.subtitle && (
                      <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{course.subtitle}</p>
                    )}
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                        Beli Satuan
                      </div>
                      <div className="text-base font-extrabold text-blue-700">{formatPrice(course.price)}</div>
                    </div>

                    <Link
                      href={`/courses/detail?id=${course.id}`}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
                    >
                      Lihat & Beli →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function HomeCatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
          Memuat katalog kursus...
        </div>
      }
    >
      <HomeCatalogContent />
    </Suspense>
  );
}
