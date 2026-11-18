'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, resolveMediaUrl } from '@/lib/api';
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

  // Checkout state — mendukung pembelian langsung tanpa daftar akun dulu
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

  // Review state
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  const loadCourseData = useCallback(async () => {
    if (!courseId) {
      setError('Kelas yang Anda cari tidak ditemukan.');
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
      setError(errorMessage(err, 'Gagal memuat informasi kelas'));
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
      const msg = errorMessage(err, 'Gagal memproses pendaftaran kelas');
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
      setReviewMsg('Terima kasih! Cerita pengalaman belajar Anda berhasil dibagikan.');
      setComment('');
      const revRes = await apiFetch<{ data: CourseReview[] }>(`/courses/${courseId}/reviews`);
      setReviews(revRes.data || []);
    } catch (err: unknown) {
      setReviewMsg(`Belum berhasil menyimpan ulasan: ${errorMessage(err)}`);
    } finally {
      setReviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-8 py-16">
        <div className="rounded-xl border border-blue-gray-100 bg-white p-8 animate-pulse space-y-4 shadow-md">
          <div className="h-6 w-1/2 bg-blue-gray-100 rounded" />
          <div className="h-4 w-3/4 bg-blue-gray-50 rounded" />
          <div className="h-48 w-full bg-blue-gray-50 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="container max-w-4xl mx-auto px-8 py-16">
        <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow-md">
          <p className="text-base font-bold text-red-700">{error || 'Kelas tidak ditemukan'}</p>
          <Link href="/" className="btn-primary mt-4">
            ← Kembali Pilih Kelas Lainnya
          </Link>
        </div>
      </div>
    );
  }

  const totalLessons = modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0);
  const bannerImg = course.thumbnail_url ? resolveMediaUrl(course.thumbnail_url) : '/image/blogs/blog4.svg';

  return (
    <div className="container mx-auto px-4 sm:px-8 py-12">
      <div className="mb-6">
        <Link
          href="/#explore-courses"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 hover:text-gray-900"
        >
          ← Lihat Pilihan Kelas Lainnya
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
        {/* Kolom Kiri: Info Kursus, Silabus & Ulasan */}
        <div className="lg:col-span-2 space-y-8">
          {/* Course Showcase Card */}
          <div className="relative flex flex-col bg-clip-border rounded-xl bg-white text-gray-700 shadow-md border border-blue-gray-100 overflow-hidden">
            <div className="relative h-64 sm:h-72 w-full overflow-hidden bg-gray-900">
              <Image
                width={960}
                height={540}
                src={bannerImg}
                alt={course.title}
                className="h-full w-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-white text-gray-900">
                    Tingkat: {getLevelLabel(course.level)}
                  </span>
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-gray-900/80 text-amber-400 border border-white/20">
                    ★ {Number(course.rating_avg || 0).toFixed(1)} ({course.total_reviews} ulasan alumni)
                  </span>
                  <span className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-900/80 text-white border border-white/20">
                    {modules.length} Bab Pembahasan • {totalLessons} Materi Praktis
                  </span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold leading-snug text-white">
                  {course.title}
                </h1>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              {course.subtitle && (
                <p className="text-lg font-normal text-gray-700 leading-relaxed mb-4">
                  {course.subtitle}
                </p>
              )}

              {course.description && (
                <div className="pt-4 border-t border-blue-gray-100">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-blue-gray-900 mb-2">
                    Apa Saja yang Akan Anda Pelajari &amp; Kuasai?
                  </h2>
                  <p className="text-base text-gray-500 leading-relaxed whitespace-pre-line">
                    {course.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Silabus Modul & Pelajaran */}
          <div className="rounded-xl border border-blue-gray-100 bg-white p-6 sm:p-8 shadow-md">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h6 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  KURIKULUM TERSTRUKTUR
                </h6>
                <h2 className="text-2xl font-bold text-blue-gray-900">
                  Daftar Materi Pembelajaran
                </h2>
              </div>
              {isEnrolled && (
                <Link
                  href={`/learn?course_id=${course.id}`}
                  className="btn-primary py-2 px-4"
                >
                  Lanjut Belajar →
                </Link>
              )}
            </div>

            {modules.length === 0 ? (
              <p className="text-sm text-gray-500">Materi untuk kelas ini sedang disiapkan oleh mentor.</p>
            ) : (
              <div className="space-y-4">
                {modules.map((mod) => (
                  <div key={mod.id} className="border border-blue-gray-100 rounded-xl overflow-hidden">
                    <div className="bg-blue-gray-50/60 px-5 py-3.5 border-b border-blue-gray-100 flex items-center justify-between">
                      <span className="font-bold text-sm text-blue-gray-900">{mod.title}</span>
                      <span className="text-xs font-medium text-gray-500">{mod.lessons?.length || 0} materi</span>
                    </div>
                    <div className="divide-y divide-blue-gray-50">
                      {(mod.lessons || []).map((les) => (
                        <div
                          key={les.id}
                          className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-md bg-blue-gray-50 text-blue-gray-800 font-bold">
                              {(() => {
                                const meta = getLessonTypeMeta(les.lesson_type);
                                return `${meta.icon} ${meta.label}`;
                              })()}
                            </span>
                            <span className="font-semibold text-blue-gray-900 text-sm">{les.title}</span>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            <span className="text-gray-500">{formatDuration(les.duration_seconds)}</span>
                            {les.is_free_preview || isEnrolled ? (
                              <Link
                                href={`/learn?course_id=${course.id}&lesson_id=${les.id}`}
                                className="px-3 py-1.5 rounded-lg bg-gray-900 text-white font-bold uppercase tracking-wider text-[11px] hover:bg-gray-800 transition-colors"
                              >
                                {les.is_free_preview && !isEnrolled ? '🔓 Coba Tonton Gratis' : '▶ Mulai Belajar'}
                              </Link>
                            ) : (
                              <span className="px-3 py-1.5 rounded-lg bg-blue-gray-50 text-gray-500 font-medium">
                                🔒 Terbuka Setelah Membeli
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

          {/* Ulasan & Rating Pelajar */}
          <div className="rounded-xl border border-blue-gray-100 bg-white p-6 sm:p-8 shadow-md">
            <h6 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              CERITA ALUMNI KELAS INI
            </h6>
            <h2 className="text-2xl font-bold text-blue-gray-900 mb-6">
              Apa Kata Mereka yang Sudah Belajar? ({reviews.length})
            </h2>

            {isEnrolled && (
              <form
                onSubmit={handleReviewSubmit}
                className="mb-6 p-5 rounded-xl bg-blue-gray-50/50 border border-blue-gray-100 space-y-3"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-blue-gray-900">
                  Bagikan Pengalaman Belajar Anda
                </div>
                {reviewMsg && (
                  <div className="text-xs font-semibold text-gray-900 bg-white p-2.5 rounded-lg border border-blue-gray-200">
                    {reviewMsg}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-700">Kepuasan Anda:</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-blue-gray-200 text-xs bg-white"
                  >
                    <option value={5}>★★★★★ (5 - Sangat Membantu!)</option>
                    <option value={4}>★★★★☆ (4 - Materi Bagus)</option>
                    <option value={3}>★★★☆☆ (3 - Cukup Baik)</option>
                    <option value={2}>★★☆☆☆ (2 - Kurang)</option>
                    <option value={1}>★☆☆☆☆ (1 - Perlu Perbaikan)</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Ceritakan manfaat yang Anda rasakan setelah mengikuti kelas ini..."
                  className="input"
                />
                <button
                  type="submit"
                  disabled={reviewLoading}
                  className="btn-primary py-2 px-5"
                >
                  {reviewLoading ? 'Menyimpan...' : 'Kirim Ulasan'}
                </button>
              </form>
            )}

            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500">Jadilah yang pertama membagikan pengalaman belajar di kelas ini.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reviews.map((rev) => (
                  <div key={rev.id} className="p-5 rounded-xl border border-blue-gray-100 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-blue-gray-900">
                        {rev.user_name || 'Alumni Sinau'}
                      </span>
                      <span className="text-xs font-semibold text-amber-500">
                        {'★'.repeat(rev.rating)}
                        {'☆'.repeat(5 - rev.rating)}
                      </span>
                    </div>
                    {rev.comment && <p className="text-sm text-gray-500">&quot;{rev.comment}&quot;</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Kolom Kanan: Kartu Checkout */}
        <div className="rounded-xl border border-blue-gray-100 bg-white p-6 sm:p-8 shadow-lg shadow-black/5 sticky top-28">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
            INVESTASI SEKALI BAYAR
          </div>
          <div className="text-3xl font-bold text-blue-gray-900 mt-1">{formatPrice(course.price)}</div>
          <div className="mt-3 space-y-1.5 text-xs text-gray-600">
            <div>✓ Akses kelas selamanya tanpa biaya bulanan</div>
            <div>✓ Bebas belajar lewat Website maupun Aplikasi HP</div>
            <div>✓ Termasuk Sertifikat Resmi Kelulusan</div>
          </div>

          {isEnrolled ? (
            <div className="mt-6 space-y-3">
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
                ✅ Kelas ini sudah menjadi milik Anda!
              </div>
              <Link
                href={`/learn?course_id=${course.id}`}
                className="btn-primary w-full"
              >
                Mulai Belajar Sekarang →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleCheckout} className="mt-6 space-y-4">
              {!user && (
                <div className="p-4 rounded-xl bg-blue-gray-50/60 border border-blue-gray-100 space-y-2.5">
                  <div className="text-xs font-bold text-blue-gray-900">
                    Ambil Kelas Tanpa Perlu Daftar Akun Dulu
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Cukup lengkapi data singkat di bawah ini. Begitu pembayaran selesai, link akses ruang belajar langsung dikirimkan ke email Anda.
                  </p>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Nama Lengkap Anda (untuk Sertifikat) *"
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
                    placeholder="Nomor WhatsApp / HP *"
                    className="input"
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                      Tanggal Lahir *
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
                <label className="block text-xs font-bold uppercase tracking-wider text-blue-gray-800 mb-1.5">
                  Punya Kode Promo / Beasiswa?
                </label>
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder="Ketik kode voucher di sini..."
                  className="input font-mono uppercase"
                />
                {DEMO_MODE && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['HEMAT50', 'POTONG25RB', 'BEASISWA100'].map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setVoucherCode(code)}
                        className="px-2.5 py-1 rounded-md bg-blue-gray-50 hover:bg-gray-900 text-[10px] font-mono font-bold text-blue-gray-800 hover:text-white border border-blue-gray-100 transition-colors"
                      >
                        Pakai {code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-gray-500">
                Pembayaran mudah, aman &amp; otomatis melalui <strong className="text-gray-900">QRIS, Transfer Bank (Virtual Account), E-Wallet, atau Kartu</strong>.
              </div>

              {txError && <div className="alert-error">{txError}</div>}

              <button
                type="submit"
                disabled={txLoading}
                className="btn-primary w-full"
              >
                {txLoading ? 'Menyiapkan Akses Kelas...' : 'Ambil Kelas Ini Sekarang'}
              </button>
            </form>
          )}

          {/* Ringkasan Invoice Hasil Checkout */}
          {txResult && (
            <div className="mt-5 p-4 rounded-xl bg-blue-gray-50/60 border border-blue-gray-100 space-y-2 text-xs">
              <div className="font-bold text-blue-gray-900">Rincian Pembelian Anda</div>
              <div className="flex justify-between text-gray-600">
                <span>Harga Normal Kelas:</span>
                <span>{formatRupiah(txResult.amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Hemat dari Voucher:</span>
                <span>- {formatRupiah(txResult.discount)}</span>
              </div>
              <div className="flex justify-between font-bold text-blue-gray-900 pt-2 border-t border-blue-gray-200">
                <span>Total Investasi:</span>
                <span>{formatPrice(txResult.final_amount)}</span>
              </div>
              {txResult.external_transaction_id && (
                <div className="pt-2 text-[11px] text-gray-500">
                  Nomor Pesanan: <code className="font-mono font-semibold">{txResult.external_transaction_id}</code>
                </div>
              )}
              {txResult.final_amount === 0 && !user && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                  🎉 Selamat! Kelas berhasil diaktifkan. Silakan cek kotak masuk email <strong>{guestEmail}</strong> untuk langsung masuk ke ruang belajar.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRegisteredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="card max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-bold shrink-0">
                !
              </div>
              <h3 className="text-base font-bold text-blue-gray-900">Email Anda Sudah Terdaftar</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Email <strong>{guestEmail}</strong> sudah memiliki akun di Sinau. Silakan masuk terlebih dahulu agar kelas baru ini langsung tersimpan di akun Anda.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRegisteredModal(false)}
                className="btn-outline flex-1 py-2 px-3"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="btn-primary flex-1 py-2 px-3"
              >
                Masuk Sekarang →
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
        <div className="container mx-auto px-4 py-12 text-center text-sm text-gray-500">
          Menyiapkan informasi lengkap kelas...
        </div>
      }
    >
      <CourseDetailContent />
    </Suspense>
  );
}
