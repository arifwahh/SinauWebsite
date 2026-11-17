'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuthUser } from '@/lib/auth';
import {
  errorMessage,
  formatDuration,
  formatPrice,
  formatRupiah,
  getLessonTypeMeta,
  getLevelLabel,
  getMaxBirthDate,
} from '@/lib/format';
import type { Course, CourseReview, Enrollment, Module, TransactionResult } from '@/lib/types';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function CourseDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('id') || '';
  const { user } = useAuthUser();

  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Checkout state (FR-10, FR-11, FR-12) — mendukung guest checkout
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestBirthDate, setGuestBirthDate] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [showRegisteredModal, setShowRegisteredModal] = useState(false);

  const maxBirthDate = getMaxBirthDate(13);

  // Review state (FR-26)
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const loadCourseData = useCallback(async () => {
    if (!courseId) {
      setError('ID Kursus tidak ditemukan di URL.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [detailRes, revRes, myRes] = await Promise.all([
        apiFetch<{ data: { course: Course; modules: Module[] } }>(`/courses/${courseId}`),
        apiFetch<{ data: CourseReview[] }>(`/courses/${courseId}/reviews`),
        user
          ? apiFetch<{ data: Enrollment[] }>('/my-courses').catch(() => ({ data: [] as Enrollment[] }))
          : Promise.resolve(null),
      ]);
      setCourse(detailRes.data.course);
      setModules(detailRes.data.modules || []);
      setReviews(revRes.data || []);

      if (myRes) {
        setIsEnrolled((myRes.data || []).some((e) => e.course_id === courseId));
      } else {
        setIsEnrolled(false);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, 'Gagal memuat detail kursus'));
    } finally {
      setLoading(false);
    }
  }, [courseId, user]);

  useEffect(() => {
    loadCourseData();
  }, [loadCourseData]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    setTxLoading(true);
    setTxError(null);
    setTxResult(null);
    try {
      const res = await apiFetch<TransactionResult>('/transactions', {
        method: 'POST',
        body: JSON.stringify({
          course_id: courseId,
          payment_gateway: 'xendit',
          voucher_code: voucherCode.trim() || undefined,
          ...(user
            ? {}
            : {
                full_name: guestName,
                email: guestEmail,
                phone: guestPhone,
                birth_date: guestBirthDate,
              }),
        }),
      });
      if (res.payment_url) {
        window.location.href = res.payment_url;
        return;
      }
      setTxResult(res);
      if (res.final_amount === 0 && user) {
        setIsEnrolled(true);
      }
    } catch (err: unknown) {
      const msg = errorMessage(err, 'Gagal memproses transaksi');
      if (!user && msg.toLowerCase().includes('akun sudah terdaftar')) {
        setShowRegisteredModal(true);
      } else {
        setTxError(msg);
      }
    } finally {
      setTxLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewLoading(true);
    setReviewMsg(null);
    try {
      await apiFetch(`/courses/${courseId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      });
      setReviewMsg('Terima kasih! Ulasan dan rating berhasil disimpan.');
      setComment('');
      const revRes = await apiFetch<{ data: CourseReview[] }>(`/courses/${courseId}/reviews`);
      setReviews(revRes.data || []);
    } catch (err: unknown) {
      setReviewMsg(`Gagal: ${errorMessage(err)}`);
    } finally {
      setReviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 animate-pulse space-y-4">
          <div className="h-6 w-1/2 bg-slate-200 rounded" />
          <div className="h-4 w-3/4 bg-slate-100 rounded" />
          <div className="h-40 w-full bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
          <p className="text-base font-bold text-red-700">{error || 'Kursus tidak ditemukan'}</p>
          <Link
            href="/"
            className="inline-block mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
          >
            ← Kembali ke Katalog
          </Link>
        </div>
      </div>
    );
  }

  const totalLessons = modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link href="/" className="text-xs font-semibold text-blue-600 hover:underline">
          ← Kembali ke Katalog Kursus
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Kolom Kiri: Info Kursus, Silabus & Ulasan */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                {getLevelLabel(course.level)}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                ★ {Number(course.rating_avg || 0).toFixed(1)} ({course.total_reviews} ulasan)
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                {modules.length} Bab • {totalLessons} Pelajaran
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{course.title}</h1>
            {course.subtitle && <p className="text-sm text-slate-600 mt-2">{course.subtitle}</p>}

            {course.description && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 mb-2">Deskripsi Kursus</h2>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {course.description}
                </p>
              </div>
            )}
          </div>

          {/* Silabus Modul & Pelajaran (FR-21, FR-22) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Silabus & Materi Kurikulum</h2>
              {isEnrolled && (
                <Link
                  href={`/learn?course_id=${course.id}`}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Buka di Ruang Belajar →
                </Link>
              )}
            </div>

            {modules.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada modul yang ditambahkan pada kursus ini.</p>
            ) : (
              <div className="space-y-4">
                {modules.map((mod) => (
                  <div key={mod.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-800">{mod.title}</span>
                      <span className="text-xs text-slate-500">{mod.lessons?.length || 0} materi</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {(mod.lessons || []).map((les) => (
                        <div
                          key={les.id}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                              {(() => {
                                const meta = getLessonTypeMeta(les.lesson_type);
                                return `${meta.icon} ${meta.label}`;
                              })()}
                            </span>
                            <span className="font-semibold text-slate-800">{les.title}</span>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            <span className="text-slate-400">{formatDuration(les.duration_seconds)}</span>
                            {les.is_free_preview || isEnrolled ? (
                              <Link
                                href={`/learn?course_id=${course.id}&lesson_id=${les.id}`}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100"
                              >
                                {les.is_free_preview && !isEnrolled ? '🔓 Free Preview' : '▶ Mulai Belajar'}
                              </Link>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 font-medium">
                                🔒 Terkunci
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ulasan & Rating Pelajar (FR-26) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              Ulasan Pelajar ({reviews.length})
            </h2>

            {isEnrolled && (
              <form
                onSubmit={handleReviewSubmit}
                className="mb-6 p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3"
              >
                <div className="text-xs font-bold text-slate-800">Berikan Rating & Ulasan Anda</div>
                {reviewMsg && (
                  <div className="text-xs font-semibold text-blue-700 bg-white p-2 rounded-lg border border-blue-200">
                    {reviewMsg}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-700">Rating Bintang:</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value={5}>★★★★★ (5 - Sangat Puas)</option>
                    <option value={4}>★★★★☆ (4 - Bagus)</option>
                    <option value={3}>★★★☆☆ (3 - Cukup)</option>
                    <option value={2}>★★☆☆☆ (2 - Kurang)</option>
                    <option value={1}>★☆☆☆☆ (1 - Buruk)</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tulis pengalaman belajar Anda di kursus ini..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={reviewLoading}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {reviewLoading ? 'Menyimpan...' : 'Kirim Ulasan'}
                </button>
              </form>
            )}

            {reviews.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada ulasan untuk kursus ini.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((rev) => (
                  <div key={rev.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/60">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-800">{rev.user_name || 'Pelajar Sinau'}</span>
                      <span className="text-xs font-semibold text-amber-500">
                        {'★'.repeat(rev.rating)}
                        {'☆'.repeat(5 - rev.rating)}
                      </span>
                    </div>
                    {rev.comment && <p className="text-xs text-slate-600">{rev.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Kartu Checkout Pembelian Satuan (FR-10, FR-11, FR-12) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm sticky top-24">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pembelian Kursus Satuan (FR-10)
          </div>
          <div className="text-2xl font-extrabold text-blue-700 mt-1">{formatPrice(course.price)}</div>
          <p className="text-xs text-slate-500 mt-1">
            Akses selamanya • Tanpa biaya langganan • Termasuk Sertifikat Kelulusan
          </p>

          {isEnrolled ? (
            <div className="mt-6 space-y-3">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
                ✅ Anda sudah terdaftar di kursus ini!
              </div>
              <Link
                href={`/learn?course_id=${course.id}`}
                className="block w-full text-center py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-colors"
              >
                Masuk ke Ruang Belajar →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleCheckout} className="mt-6 space-y-4">
              {!user && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
                  <div className="text-xs font-bold text-blue-900">
                    Data Pembeli (Tanpa Perlu Daftar Akun Dulu)
                  </div>
                  <p className="text-[11px] text-blue-700">
                    Setelah pembayaran berhasil, email berisi link login &amp; atur password akan dikirim ke alamat email Anda.
                  </p>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nama Lengkap *"
                    className="input"
                  />
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="Alamat Email Aktif *"
                    className="input"
                  />
                  <input
                    type="tel"
                    required
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="Nomor HP / WhatsApp *"
                    className="input"
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tanggal Lahir * (min. 13 tahun)
                    </label>
                    <input
                      type="date"
                      required
                      max={maxBirthDate}
                      value={guestBirthDate}
                      onChange={(e) => setGuestBirthDate(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode Voucher Diskon (FR-12)
                </label>
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Contoh: HEMAT50 atau BEASISWA100"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {DEMO_MODE && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['HEMAT50', 'POTONG25RB', 'BEASISWA100'].map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setVoucherCode(code)}
                        className="px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-[10px] font-mono font-semibold text-slate-700 hover:text-blue-700 border border-slate-200"
                      >
                        Pakai {code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-500">
                Pembayaran diproses aman melalui <strong className="text-slate-700">Xendit Invoice</strong> (VA, QRIS, E-Wallet, Kartu).
              </div>

              {txError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
                  {txError}
                </div>
              )}

              <button
                type="submit"
                disabled={txLoading}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm shadow-sm transition-colors"
              >
                {txLoading ? 'Memproses Pesanan...' : 'Beli Kursus Satuan Sekarang'}
              </button>
            </form>
          )}

          {/* Ringkasan Invoice Hasil Checkout */}
          {txResult && (
            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="font-bold text-slate-900">Ringkasan Transaksi</div>
              <div className="flex justify-between text-slate-600">
                <span>Harga Kursus:</span>
                <span>{formatRupiah(txResult.amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Potongan Voucher:</span>
                <span>- {formatRupiah(txResult.discount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Bayar:</span>
                <span>{formatPrice(txResult.final_amount)}</span>
              </div>
              {txResult.external_transaction_id && (
                <div className="pt-2 text-[11px] text-slate-500">
                  Order ID: <code className="font-mono font-semibold">{txResult.external_transaction_id}</code>
                </div>
              )}
              {txResult.final_amount === 0 && !user && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                  ✅ Pembelian berhasil! Silakan cek email <strong>{guestEmail}</strong> untuk link login &amp; pembaruan password.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showRegisteredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="card max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-bold shrink-0">
                !
              </div>
              <h3 className="text-base font-bold text-slate-900">Akun Sudah Terdaftar</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Email <strong>{guestEmail}</strong> sudah terdaftar. Silakan login terlebih dahulu untuk melakukan pembelian kursus.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRegisteredModal(false)}
                className="flex-1 py-2 px-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="btn-primary flex-1 text-xs py-2"
              >
                Login Sekarang →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
          Memuat detail kursus...
        </div>
      }
    >
      <CourseDetailContent />
    </Suspense>
  );
}
