'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { errorMessage, formatPrice, toSlug } from '@/lib/format';
import type { CourseStatus, CourseWithModules } from '@/lib/types';

interface Props {
  courses: CourseWithModules[];
  onRefresh: () => Promise<void>;
  notify: (type: 'ok' | 'err', msg: string) => void;
}

const STATUS_ACTIONS: { status: CourseStatus; label: string; className: string }[] = [
  { status: 'published', label: '✓ Publish', className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  { status: 'reviewing', label: 'Reviewing', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
  { status: 'rejected', label: '✕ Reject', className: 'bg-red-600 hover:bg-red-700 text-white' },
  { status: 'draft', label: 'Draft', className: 'bg-slate-200 hover:bg-slate-300 text-slate-700' },
];

export default function CuratorTab({ courses, onRefresh, notify }: Props) {
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleStatusChange = async (courseId: string, status: CourseStatus) => {
    try {
      await apiFetch(`/admin/courses/${courseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify('ok', `Status kursus berhasil diubah menjadi ${status.toUpperCase()}`);
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: catName,
          slug: catSlug || toSlug(catName),
          description: catDesc || null,
        }),
      });
      notify('ok', `Kategori "${catName}" berhasil dibuat!`);
      setCatName('');
      setCatSlug('');
      setCatDesc('');
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 card p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Review & Persetujuan Status Kursus (FR-72)
        </h2>
        <p className="text-xs text-slate-500">
          Kursus dari instruktur eksternal wajib direview Kurator sebelum tampil di katalog publik.
        </p>

        <div className="divide-y divide-slate-200">
          {courses.map((c) => (
            <div
              key={c.id}
              className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      c.status === 'published'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : c.status === 'rejected'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {c.status}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{c.title}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Harga: {formatPrice(c.price)} • {c.modules?.length || 0} Modul
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {STATUS_ACTIONS.map((act) => (
                  <button
                    key={act.status}
                    type="button"
                    onClick={() => handleStatusChange(c.id, act.status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${act.className}`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleCreateCategory} className="card p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Tambah Kategori Kursus (FR-90)</h2>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kategori *</label>
          <input
            type="text"
            required
            value={catName}
            onChange={(e) => {
              setCatName(e.target.value);
              setCatSlug(toSlug(e.target.value));
            }}
            placeholder="Contoh: Desain Grafis & UI/UX"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Slug Kategori *</label>
          <input
            type="text"
            required
            value={catSlug}
            onChange={(e) => setCatSlug(e.target.value)}
            className="input font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi</label>
          <textarea
            rows={2}
            value={catDesc}
            onChange={(e) => setCatDesc(e.target.value)}
            className="input"
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full text-xs">
          {submitting ? 'Menyimpan...' : '+ Simpan Kategori'}
        </button>
      </form>
    </div>
  );
}
