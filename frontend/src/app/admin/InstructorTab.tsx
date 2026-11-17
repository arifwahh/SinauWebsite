'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { LEVEL_LABELS, errorMessage, toSlug } from '@/lib/format';
import type { Category, Course, CourseWithModules, Lesson, Module, QuizQuestion } from '@/lib/types';

interface QuestionDraft {
  uid: string;
  question_text: string;
  question_type: QuizQuestion['question_type'];
  optionsText: string;
  correct_answer: string;
  points: number;
}

const newQuestionDraft = (): QuestionDraft => ({
  uid: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  question_text: '',
  question_type: 'multiple_choice',
  optionsText: 'Pilihan A, Pilihan B, Pilihan C, Pilihan D',
  correct_answer: 'Pilihan A',
  points: 10,
});

interface Props {
  categories: Category[];
  courses: CourseWithModules[];
  onRefresh: () => Promise<void>;
  notify: (type: 'ok' | 'err', msg: string) => void;
}

export default function InstructorTab({ categories, courses, onRefresh, notify }: Props) {
  // Buat Kursus
  const [cTitle, setCTitle] = useState('');
  const [cSlug, setCSlug] = useState('');
  const [cSubtitle, setCSubtitle] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cCatId, setCCatId] = useState<number>(0);
  const [cPrice, setCPrice] = useState('150000');
  const [cLevel, setCLevel] = useState('beginner');
  const [cSubmitting, setCSubmitting] = useState(false);

  // Buat Modul
  const [mCourseId, setMCourseId] = useState('');
  const [mTitle, setMTitle] = useState('');
  const [mOrder, setMOrder] = useState(1);
  const [mSubmitting, setMSubmitting] = useState(false);

  // Buat Pelajaran
  const [lModuleId, setLModuleId] = useState('');
  const [lTitle, setLTitle] = useState('');
  const [lType, setLType] = useState('video');
  const [lContentUrl, setLContentUrl] = useState('');
  const [lDuration, setLDuration] = useState(360);
  const [lOrder, setLOrder] = useState(1);
  const [lFreePreview, setLFreePreview] = useState(false);
  const [lSubmitting, setLSubmitting] = useState(false);

  // Buat Kuis
  const [qLessonId, setQLessonId] = useState('');
  const [qTitle, setQTitle] = useState('');
  const [qPassingScore, setQPassingScore] = useState(70);
  const [qTimeLimit, setQTimeLimit] = useState(15);
  const [qIsFinal, setQIsFinal] = useState(false);
  const [qQuestions, setQQuestions] = useState<QuestionDraft[]>([newQuestionDraft()]);
  const [qSubmitting, setQSubmitting] = useState(false);

  useEffect(() => {
    if (categories.length > 0 && cCatId === 0) {
      setCCatId(categories[0].id);
    }
  }, [categories, cCatId]);

  useEffect(() => {
    if (courses.length > 0) {
      setMCourseId((prev) => prev || courses[0].id);
      const firstMod = courses.find((c) => c.modules && c.modules.length > 0)?.modules?.[0];
      if (firstMod) {
        setLModuleId((prev) => prev || firstMod.id);
      }
    }
  }, [courses]);

  const updateQuestion = (idx: number, patch: Partial<QuestionDraft>) => {
    setQQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCSubmitting(true);
    try {
      const res = await apiFetch<{ data: Course }>('/courses', {
        method: 'POST',
        body: JSON.stringify({
          category_id: cCatId > 0 ? cCatId : null,
          title: cTitle,
          slug: cSlug || toSlug(cTitle),
          subtitle: cSubtitle || null,
          description: cDesc || null,
          price: Number(cPrice),
          level: cLevel,
        }),
      });
      notify(
        'ok',
        `Kursus "${res.data.title}" berhasil dibuat dengan status: ${res.data.status.toUpperCase()}`
      );
      setCTitle('');
      setCSlug('');
      setCSubtitle('');
      setCDesc('');
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setCSubmitting(false);
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mCourseId) return notify('err', 'Pilih kursus terlebih dahulu');
    setMSubmitting(true);
    try {
      const res = await apiFetch<{ data: Module }>(`/courses/${mCourseId}/modules`, {
        method: 'POST',
        body: JSON.stringify({ title: mTitle, order_index: Number(mOrder) }),
      });
      notify('ok', `Modul "${res.data.title}" berhasil ditambahkan!`);
      setMTitle('');
      setMOrder((prev) => prev + 1);
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setMSubmitting(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lModuleId) return notify('err', 'Pilih modul terlebih dahulu');
    setLSubmitting(true);
    try {
      const res = await apiFetch<{ data: Lesson }>(`/modules/${lModuleId}/lessons`, {
        method: 'POST',
        body: JSON.stringify({
          title: lTitle,
          lesson_type: lType,
          content_url: lType === 'quiz' ? null : lContentUrl || null,
          duration_seconds: Number(lDuration),
          order_index: Number(lOrder),
          is_free_preview: lFreePreview,
        }),
      });
      notify('ok', `Pelajaran "${res.data.title}" berhasil ditambahkan!`);
      if (lType === 'quiz') {
        setQLessonId(res.data.id);
      }
      setLTitle('');
      setLContentUrl('');
      setLOrder((prev) => prev + 1);
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setLSubmitting(false);
    }
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qLessonId) return notify('err', 'Pilih pelajaran bertipe Quiz terlebih dahulu');
    setQSubmitting(true);
    try {
      const payloadQuestions: QuizQuestion[] = qQuestions.map((q) => ({
        question_text: q.question_text,
        question_type: q.question_type,
        options:
          q.question_type === 'short_answer'
            ? []
            : q.optionsText
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        correct_answer: q.correct_answer,
        points: Number(q.points),
      }));

      await apiFetch(`/lessons/${qLessonId}/quiz`, {
        method: 'POST',
        body: JSON.stringify({
          title: qTitle,
          passing_score: Number(qPassingScore),
          time_limit_minutes: Number(qTimeLimit),
          is_final_exam: qIsFinal,
          questions: payloadQuestions,
        }),
      });
      notify('ok', `Kuis "${qTitle}" beserta ${qQuestions.length} soal berhasil disimpan!`);
      setQTitle('');
      setQQuestions([newQuestionDraft()]);
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setQSubmitting(false);
    }
  };

  const allModules = courses.flatMap((c) =>
    (c.modules || []).map((m) => ({ ...m, courseTitle: c.title }))
  );
  const quizLessons = allModules.flatMap((m) =>
    (m.lessons || [])
      .filter((l) => l.lesson_type === 'quiz')
      .map((l) => ({ ...l, courseTitle: m.courseTitle, moduleTitle: m.title }))
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 1. Form Buat Kursus Baru */}
      <form onSubmit={handleCreateCourse} className="card p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">1. Buat Kursus Satuan Baru</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Kursus *</label>
            <input
              type="text"
              required
              value={cTitle}
              onChange={(e) => {
                setCTitle(e.target.value);
                setCSlug(toSlug(e.target.value));
              }}
              placeholder="Contoh: Mahir Docker & Kubernetes"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Slug URL *</label>
            <input
              type="text"
              required
              value={cSlug}
              onChange={(e) => setCSlug(e.target.value)}
              className="input font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
            <select
              value={cCatId}
              onChange={(e) => setCCatId(Number(e.target.value))}
              className="input"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Satuan (Rp) *</label>
            <input
              type="number"
              min={0}
              required
              value={cPrice}
              onChange={(e) => setCPrice(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Level</label>
            <select value={cLevel} onChange={(e) => setCLevel(e.target.value)} className="input">
              {Object.entries(LEVEL_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subjudul Ringkas</label>
            <input
              type="text"
              value={cSubtitle}
              onChange={(e) => setCSubtitle(e.target.value)}
              placeholder="Ringkasan 1 kalimat tentang kursus ini"
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Lengkap</label>
            <textarea
              rows={2}
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <button type="submit" disabled={cSubmitting} className="btn-primary w-full text-xs">
          {cSubmitting ? 'Menyimpan...' : '+ Simpan Kursus Baru'}
        </button>
      </form>

      {/* 2. Form Tambah Modul & Pelajaran */}
      <div className="space-y-6">
        <form onSubmit={handleCreateModule} className="card p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">2. Tambah Modul / Bab ke Kursus</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Kursus *</label>
            <select
              value={mCourseId}
              onChange={(e) => setMCourseId(e.target.value)}
              className="input"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.status})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Modul / Bab *</label>
              <input
                type="text"
                required
                value={mTitle}
                onChange={(e) => setMTitle(e.target.value)}
                placeholder="Contoh: Bab 1: Dasar Pemrograman"
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Urutan</label>
              <input
                type="number"
                min={1}
                value={mOrder}
                onChange={(e) => setMOrder(Number(e.target.value))}
                className="input"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={mSubmitting}
            className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold"
          >
            {mSubmitting ? 'Menyimpan...' : '+ Tambah Modul'}
          </button>
        </form>

        <form onSubmit={handleCreateLesson} className="card p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">3. Tambah Pelajaran ke Modul</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Modul *</label>
            <select
              value={lModuleId}
              onChange={(e) => setLModuleId(e.target.value)}
              className="input"
            >
              <option value="">-- Pilih Modul --</option>
              {allModules.map((m) => (
                <option key={m.id} value={m.id}>
                  [{m.courseTitle}] — {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Pelajaran *</label>
              <input
                type="text"
                required
                value={lTitle}
                onChange={(e) => setLTitle(e.target.value)}
                placeholder="Contoh: 1.1 Video Pengenalan"
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Materi *</label>
              <select value={lType} onChange={(e) => setLType(e.target.value)} className="input">
                <option value="video">Video (Google Drive / HLS .m3u8)</option>
                <option value="article">Artikel Teks</option>
                <option value="pdf">Modul PDF</option>
                <option value="quiz">Kuis / Ujian</option>
              </select>
            </div>
          </div>

          {lType !== 'quiz' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lType === 'article' ? 'Isi Artikel' : 'URL Video (Google Drive / .m3u8 / .mp4) / File PDF'}
              </label>
              <input
                type="text"
                value={lContentUrl}
                onChange={(e) => setLContentUrl(e.target.value)}
                placeholder={
                  lType === 'article'
                    ? 'Tulis ringkasan atau isi artikel...'
                    : 'https://drive.google.com/file/d/.../view?usp=sharing'
                }
                className="input"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="freePrev"
                checked={lFreePreview}
                onChange={(e) => setLFreePreview(e.target.checked)}
              />
              <label htmlFor="freePrev" className="text-xs font-medium text-slate-700">
                Buka sebagai Free Preview
              </label>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Urutan:</span>
                <input
                  type="number"
                  min={1}
                  value={lOrder}
                  onChange={(e) => setLOrder(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Durasi (detik):</span>
                <input
                  type="number"
                  min={0}
                  value={lDuration}
                  onChange={(e) => setLDuration(Number(e.target.value))}
                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 text-xs"
                />
              </label>
            </div>
          </div>

          <button type="submit" disabled={lSubmitting} className="btn-primary w-full text-xs py-2">
            {lSubmitting ? 'Menyimpan...' : '+ Simpan Pelajaran'}
          </button>
        </form>
      </div>

      {/* 4. Form Buat Soal Kuis (FR-31) */}
      <form onSubmit={handleCreateQuiz} className="lg:col-span-2 card p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          4. Buat Kuis & Bank Soal pada Pelajaran Bertipe Quiz (FR-31)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pilih Pelajaran Bertipe Quiz *
            </label>
            <select
              value={qLessonId}
              onChange={(e) => setQLessonId(e.target.value)}
              className="input"
            >
              <option value="">-- Pilih Pelajaran Quiz --</option>
              {quizLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  [{l.courseTitle}] {l.title}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Kuis *</label>
            <input
              type="text"
              required
              value={qTitle}
              onChange={(e) => setQTitle(e.target.value)}
              placeholder="Kuis Evaluasi Bab 1"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Passing Score</label>
            <input
              type="number"
              min={1}
              max={100}
              value={qPassingScore}
              onChange={(e) => setQPassingScore(Number(e.target.value))}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Waktu (menit)</label>
            <input
              type="number"
              min={0}
              value={qTimeLimit}
              onChange={(e) => setQTimeLimit(Number(e.target.value))}
              className="input"
            />
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={qIsFinal}
            onChange={(e) => setQIsFinal(e.target.checked)}
          />
          Tandai sebagai Ujian Akhir Kursus
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Daftar Pertanyaan ({qQuestions.length} Soal)
            </span>
            <button
              type="button"
              onClick={() => setQQuestions((prev) => [...prev, newQuestionDraft()])}
              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
            >
              + Tambah Soal Baru
            </button>
          </div>

          {qQuestions.map((q, idx) => (
            <div key={q.uid} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    required
                    value={q.question_text}
                    onChange={(e) => updateQuestion(idx, { question_text: e.target.value })}
                    placeholder={`Pertanyaan #${idx + 1}`}
                    className="input"
                  />
                </div>
                <div>
                  <select
                    value={q.question_type}
                    onChange={(e) =>
                      updateQuestion(idx, {
                        question_type: e.target.value as QuizQuestion['question_type'],
                      })
                    }
                    className="input"
                  >
                    <option value="multiple_choice">Pilihan Ganda</option>
                    <option value="true_false">Benar / Salah</option>
                    <option value="short_answer">Isian Singkat</option>
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    required
                    value={q.correct_answer}
                    onChange={(e) => updateQuestion(idx, { correct_answer: e.target.value })}
                    placeholder="Kunci Jawaban"
                    className="input border-emerald-400"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    min={1}
                    value={q.points}
                    onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) })}
                    placeholder="Poin"
                    className="input"
                  />
                </div>
              </div>
              {q.question_type !== 'short_answer' && (
                <div className="text-[11px] text-slate-500">
                  Pilihan (pisahkan dengan koma):
                  <input
                    type="text"
                    value={q.optionsText}
                    onChange={(e) => updateQuestion(idx, { optionsText: e.target.value })}
                    className="input mt-1"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={qSubmitting}
          className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-bold"
        >
          {qSubmitting ? 'Menyimpan...' : 'Simpan Kuis & Bank Soal'}
        </button>
      </form>
    </div>
  );
}
