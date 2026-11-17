'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type Hls from 'hls.js';
import { apiFetch, resolveMediaUrl } from '@/lib/api';
import { useAuthUser } from '@/lib/auth';
import { errorMessage, formatDuration, getLessonTypeMeta } from '@/lib/format';
import type { Course, Lesson, Module, ProgressResult, Quiz, QuizSubmitResult } from '@/lib/types';

function selectHlsLevel(hls: Hls, dataSaver360p: boolean) {
  if (!hls.levels || hls.levels.length === 0) return;
  if (dataSaver360p) {
    const idx360 = hls.levels.findIndex((lvl) => lvl.height > 0 && lvl.height <= 360);
    hls.currentLevel = idx360 >= 0 ? idx360 : 0;
  } else {
    hls.currentLevel = -1; // auto quality
  }
}

function HlsVideoPlayer({
  src,
  dataSaver360p,
  watermarkText,
  lastPosSecRef,
}: {
  src: string;
  dataSaver360p: boolean;
  watermarkText: string;
  lastPosSecRef: React.MutableRefObject<number>;
}) {
  const resolvedSrc = resolveMediaUrl(src);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dataSaverRef = useRef(dataSaver360p);
  dataSaverRef.current = dataSaver360p;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedSrc) return;

    let cancelled = false;

    if (resolvedSrc.includes('.m3u8')) {
      import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (HlsCtor.isSupported()) {
          const hls = new HlsCtor({ capLevelToPlayerSize: true });
          hlsRef.current = hls;
          hls.loadSource(resolvedSrc);
          hls.attachMedia(video);
          hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
            selectHlsLevel(hls, dataSaverRef.current);
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = resolvedSrc;
        }
      });
    } else {
      video.src = resolvedSrc;
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [resolvedSrc]);

  useEffect(() => {
    if (hlsRef.current) {
      selectHlsLevel(hlsRef.current, dataSaver360p);
    }
  }, [dataSaver360p]);

  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video border border-slate-800 shadow-lg">
      <video
        ref={videoRef}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        playsInline
        onContextMenu={(e) => e.preventDefault()}
        onTimeUpdate={(e) => {
          lastPosSecRef.current = Math.floor(e.currentTarget.currentTime || 0);
        }}
        className="w-full h-full object-contain"
      />
      {/* Watermark Dinamis Email Pengguna (FR-25) */}
      <div className="pointer-events-none select-none absolute top-4 right-4 px-2.5 py-1 rounded bg-black/40 text-white/60 text-[11px] font-mono">
        {watermarkText}
      </div>
      {dataSaver360p && (
        <div className="pointer-events-none absolute top-4 left-4 px-2.5 py-1 rounded-full bg-emerald-600/80 text-white text-[10px] font-semibold">
          ⚡ Mode Hemat Kuota (360p)
        </div>
      )}
    </div>
  );
}

function LearnRoomContent() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('course_id') || '';
  const initialLessonId = searchParams.get('lesson_id') || '';

  const { user } = useAuthUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string>(initialLessonId);
  const [lessonDetail, setLessonDetail] = useState<Lesson | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [loadingLesson, setLoadingLesson] = useState(false);

  // Video & Progress State (FR-23, FR-30)
  const [dataSaver360p, setDataSaver360p] = useState(true);
  const lastPosSecRef = useRef(0);
  const [progressLoading, setProgressLoading] = useState(false);
  const [courseProgressPct, setCourseProgressPct] = useState<number | null>(null);
  const [issuedCertCode, setIssuedCertCode] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);

  // Quiz State (FR-31, FR-32)
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    score: number;
    passing_score: number;
    is_passed: boolean;
  } | null>(null);

  // Muat silabus hanya saat courseId berubah (H3)
  useEffect(() => {
    if (!courseId) {
      setLoadingCourse(false);
      return;
    }
    const controller = new AbortController();
    setLoadingCourse(true);
    apiFetch<{ data: { course: Course; modules: Module[] } }>(`/courses/${courseId}`, {
      signal: controller.signal,
    })
      .then((res) => {
        setCourse(res.data.course);
        const mods = res.data.modules || [];
        setModules(mods);
        const firstLessonId = mods.find((m) => m.lessons && m.lessons.length > 0)?.lessons?.[0]?.id;
        if (firstLessonId) {
          setActiveLessonId((prev) => prev || firstLessonId);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLessonError(errorMessage(err, 'Gagal memuat kurikulum kursus'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCourse(false);
      });

    return () => controller.abort();
  }, [courseId]);

  // Muat detail pelajaran dengan AbortController agar klik cepat tidak saling menimpa (H4)
  useEffect(() => {
    if (!activeLessonId) return;
    const controller = new AbortController();
    setLoadingLesson(true);
    setLessonError(null);
    setLessonDetail(null);
    setQuiz(null);
    setQuizResult(null);
    setQuizAnswers({});
    setProgressMsg(null);
    lastPosSecRef.current = 0;

    (async () => {
      try {
        const res = await apiFetch<{ data: Lesson }>(`/lessons/${activeLessonId}`, {
          signal: controller.signal,
        });
        const detail = res.data;
        setLessonDetail(detail);

        if (detail.lesson_type === 'quiz') {
          const qRes = await apiFetch<{ data: Quiz }>(`/lessons/${activeLessonId}/quiz`, {
            signal: controller.signal,
          });
          setQuiz(qRes.data);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLessonError(
          errorMessage(err, 'Gagal membuka pelajaran. Pastikan Anda sudah login dan membeli kursus ini.')
        );
      } finally {
        if (!controller.signal.aborted) setLoadingLesson(false);
      }
    })();

    return () => controller.abort();
  }, [activeLessonId]);

  const handleSaveProgress = async (markCompleted: boolean) => {
    if (!activeLessonId) return;
    setProgressLoading(true);
    setProgressMsg(null);
    const pos = lastPosSecRef.current;
    try {
      const res = await apiFetch<ProgressResult>(`/lessons/${activeLessonId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          is_completed: markCompleted,
          last_position_seconds: pos,
        }),
      });
      setCourseProgressPct(res.progress_percentage);
      if (res.certificate_code) {
        setIssuedCertCode(res.certificate_code);
      }
      setProgressMsg(
        markCompleted
          ? `Pelajaran ditandai selesai! Progres kursus: ${res.progress_percentage}%`
          : `Posisi belajar (${pos} detik) berhasil disimpan.`
      );
    } catch (err: unknown) {
      setProgressMsg(`Gagal menyimpan progres: ${errorMessage(err)}`);
    } finally {
      setProgressLoading(false);
    }
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz) return;
    setQuizSubmitting(true);
    try {
      const res = await apiFetch<QuizSubmitResult>(`/quizzes/${quiz.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: quizAnswers }),
      });
      setQuizResult({
        score: res.score,
        passing_score: res.passing_score,
        is_passed: res.is_passed,
      });
    } catch (err: unknown) {
      setLessonError(errorMessage(err, 'Gagal mengirim jawaban kuis'));
    } finally {
      setQuizSubmitting(false);
    }
  };

  if (!courseId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-sm font-semibold text-slate-700">Parameter course_id tidak ditemukan.</p>
        <Link href="/my-courses" className="inline-block mt-3 text-xs font-bold text-blue-600 hover:underline">
          ← Buka Kursus Saya
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header Ruang Belajar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200">
        <div>
          <Link
            href={`/courses/detail?id=${courseId}`}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            ← Detail Kursus
          </Link>
          <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
            {course?.title || 'Ruang Belajar Sinau'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDataSaver360p(!dataSaver360p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              dataSaver360p
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}
          >
            {dataSaver360p ? '⚡ Hemat Kuota 360p: ON' : 'HD Mode: ON'}
          </button>

          {courseProgressPct !== null && (
            <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700">
              Progres: {courseProgressPct}%
            </div>
          )}
        </div>
      </div>

      {/* Banner Sertifikat Otomatis Terbit (FR-34) */}
      {issuedCertCode && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div>
            <div className="text-sm font-extrabold">🎉 Selamat! Anda Telah Menyelesaikan 100% Kursus Ini!</div>
            <div className="text-xs text-emerald-100 mt-0.5">
              Sertifikat kelulusan resmi Anda telah diterbitkan dengan kode:{' '}
              <code className="font-mono font-bold underline">{issuedCertCode}</code>
            </div>
          </div>
          <Link
            href={`/verify?code=${issuedCertCode}`}
            className="px-4 py-2 rounded-xl bg-white text-emerald-800 text-xs font-bold shadow-sm self-start sm:self-auto"
          >
            Lihat & Verifikasi Sertifikat →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Navigasi Modul & Pelajaran (FR-21) */}
        <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 bg-slate-900 text-white">
            <h2 className="text-sm font-bold">Daftar Modul & Pelajaran</h2>
            <p className="text-[11px] text-slate-300 mt-0.5">Klik materi untuk mulai belajar</p>
          </div>

          {loadingCourse ? (
            <div className="p-4 text-xs text-slate-500">Memuat silabus...</div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[70vh] overflow-y-auto">
              {modules.map((mod) => (
                <div key={mod.id}>
                  <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-slate-700">
                    {mod.title}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(mod.lessons || []).map((les) => {
                      const active = les.id === activeLessonId;
                      return (
                        <button
                          key={les.id}
                          type="button"
                          onClick={() => setActiveLessonId(les.id)}
                          className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 text-xs transition-colors ${
                            active
                              ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-blue-600'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate">
                            <span className="mr-1.5">{getLessonTypeMeta(les.lesson_type).icon}</span>
                            {les.title}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatDuration(les.duration_seconds)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Area Konten Utama Pelajaran (FR-22, FR-23, FR-30, FR-31) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            {loadingLesson ? (
              <div className="py-16 text-center text-xs text-slate-500">Memuat materi pelajaran...</div>
            ) : lessonError ? (
              <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-center space-y-3">
                <p className="text-sm font-bold text-red-700">{lessonError}</p>
                <div className="flex justify-center gap-3">
                  <Link
                    href={`/courses/detail?id=${courseId}`}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                  >
                    Beli Kursus Ini
                  </Link>
                  <Link
                    href="/login"
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold bg-white"
                  >
                    Login Akun
                  </Link>
                </div>
              </div>
            ) : !lessonDetail ? (
              <div className="py-12 text-center text-xs text-slate-500">
                Pilih salah satu pelajaran di sidebar sebelah kiri.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                      Materi {lessonDetail.lesson_type.toUpperCase()}
                    </span>
                    <h2 className="text-lg font-extrabold text-slate-900">{lessonDetail.title}</h2>
                  </div>
                  <span className="text-xs text-slate-500">
                    Durasi: {formatDuration(lessonDetail.duration_seconds)}
                  </span>
                </div>

                {/* Konten Berdasarkan Tipe Pelajaran */}
                {lessonDetail.lesson_type === 'video' && (
                  lessonDetail.content_url ? (
                    <HlsVideoPlayer
                      src={lessonDetail.content_url}
                      dataSaver360p={dataSaver360p}
                      watermarkText={user?.email || 'sinau-preview@sinau.id'}
                      lastPosSecRef={lastPosSecRef}
                    />
                  ) : (
                    <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                      URL video belum tersedia untuk pelajaran ini.
                    </div>
                  )
                )}

                {lessonDetail.lesson_type === 'article' && (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                    {lessonDetail.content_url || 'Belum ada isi artikel.'}
                  </div>
                )}

                {lessonDetail.lesson_type === 'pdf' && (
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-900">Dokumen Modul PDF</div>
                        <div className="text-xs text-slate-500">
                          Unduh atau baca materi PDF langsung di browser Anda.
                        </div>
                      </div>
                      {lessonDetail.content_url && (
                        <a
                          href={lessonDetail.content_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                        >
                          📥 Buka / Unduh PDF ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Antarmuka Kuis Interaktif (FR-31, FR-32) */}
                {lessonDetail.lesson_type === 'quiz' && quiz && (
                  <div className="space-y-5">
                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-blue-900">{quiz.title}</span>
                        {quiz.is_final_exam && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold">
                            UJIAN AKHIR
                          </span>
                        )}
                      </div>
                      <div className="text-blue-800 font-medium">
                        Nilai Minimal Lulus: <strong>{quiz.passing_score}</strong> • Batas Waktu:{' '}
                        <strong>
                          {quiz.time_limit_minutes > 0 ? `${quiz.time_limit_minutes} menit` : 'Tanpa batas waktu'}
                        </strong>
                      </div>
                    </div>

                    {quizResult && (
                      <div
                        className={`p-4 rounded-xl border text-xs font-semibold ${
                          quizResult.is_passed
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : 'bg-amber-50 border-amber-300 text-amber-900'
                        }`}
                      >
                        <div className="text-sm font-extrabold">
                          Skor Anda: {quizResult.score} / 100 —{' '}
                          {quizResult.is_passed ? '✅ LULUS!' : '❌ BELUM LULUS (Silakan Coba Lagi)'}
                        </div>
                        <div className="mt-1 font-normal">
                          Nilai minimal kelulusan: {quizResult.passing_score}.{' '}
                          {quizResult.is_passed &&
                            'Pelajaran kuis ini telah otomatis ditandai selesai!'}
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmitQuiz} className="space-y-4">
                      {(quiz.questions || []).map((q, idx) => {
                        const qId = q.id || String(idx);
                        return (
                          <div
                            key={qId}
                            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-bold text-slate-900">
                                {idx + 1}. {q.question_text}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                                ({q.points} poin)
                              </span>
                            </div>

                            {q.question_type === 'short_answer' ? (
                              <input
                                type="text"
                                required
                                value={quizAnswers[qId] || ''}
                                onChange={(e) =>
                                  setQuizAnswers((prev) => ({ ...prev, [qId]: e.target.value }))
                                }
                                placeholder="Ketik jawaban singkat Anda..."
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                              />
                            ) : (
                              <div className="space-y-2">
                                {(q.options || []).map((opt) => (
                                  <label
                                    key={opt}
                                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 cursor-pointer text-xs"
                                  >
                                    <input
                                      type="radio"
                                      name={`q-${qId}`}
                                      required
                                      value={opt}
                                      checked={quizAnswers[qId] === opt}
                                      onChange={() =>
                                        setQuizAnswers((prev) => ({ ...prev, [qId]: opt }))
                                      }
                                      className="text-blue-600"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button
                        type="submit"
                        disabled={quizSubmitting}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold shadow-sm"
                      >
                        {quizSubmitting ? 'Menilai Jawaban...' : 'Kirim Jawaban Kuis & Nilai Otomatis'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Tombol Simpan Progres Belajar (FR-30) — kuis diselesaikan lewat SubmitQuiz (H5) */}
                {lessonDetail.lesson_type !== 'quiz' && (
                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-slate-600">
                      {progressMsg ? (
                        <span className="font-semibold text-emerald-700">{progressMsg}</span>
                      ) : (
                        <span>Simpan progres belajar Anda untuk mendapatkan sertifikat otomatis saat 100%.</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={progressLoading}
                        onClick={() => handleSaveProgress(false)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                      >
                        Simpan Posisi Video
                      </button>
                      <button
                        type="button"
                        disabled={progressLoading}
                        onClick={() => handleSaveProgress(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                      >
                        ✓ Tandai Selesai
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
          Memuat ruang belajar...
        </div>
      }
    >
      <LearnRoomContent />
    </Suspense>
  );
}
