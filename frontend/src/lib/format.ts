import type { CourseLevel, LessonType, UserRole } from './types';

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: 'Pemula',
  intermediate: 'Menengah',
  advanced: 'Mahir',
  all_levels: 'Semua Level',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Pelajar',
  internal_instructor: 'Instruktur Internal',
  external_instructor: 'Instruktur Eksternal',
  b2b_admin: 'Admin Perusahaan (B2B)',
  curator: 'Kurator Kursus',
  super_admin: 'Super Admin',
};

export const LESSON_TYPE_META: Record<LessonType, { icon: string; label: string }> = {
  video: { icon: '🎬', label: 'Video Materi' },
  article: { icon: '📄', label: 'Bacaan Praktis' },
  pdf: { icon: '📑', label: 'Modul Panduan (PDF)' },
  quiz: { icon: '📝', label: 'Latihan Pemahaman' },
  task: { icon: '📌', label: 'Praktik Mandiri' },
  live_class: { icon: '🎥', label: 'Sesi Live' },
};

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatPrice(amount: number): string {
  if (!amount || amount <= 0) return 'Gratis';
  return formatRupiah(amount);
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 menit';
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `${mins} menit`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} jam ${rem} mnt` : `${hrs} jam`;
}

export function getLevelLabel(level: string): string {
  return LEVEL_LABELS[level as CourseLevel] || level;
}

export function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] || role;
}

export function getLessonTypeMeta(type: string): { icon: string; label: string } {
  return LESSON_TYPE_META[type as LessonType] || { icon: '📌', label: 'Materi' };
}

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getMaxBirthDate(minAge = 13): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().split('T')[0];
}

export function errorMessage(err: unknown, fallback = 'Terjadi kesalahan'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
