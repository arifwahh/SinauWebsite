'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ROLE_LABELS, errorMessage, formatRupiah, getRoleLabel } from '@/lib/format';
import type { AdminOverview, AuthUser, UserRole, Voucher } from '@/lib/types';

interface Props {
  overview: AdminOverview | null;
  usersList: AuthUser[];
  vouchersList: Voucher[];
  onRefresh: () => Promise<void>;
  notify: (type: 'ok' | 'err', msg: string) => void;
}

export default function SuperAdminTab({
  overview,
  usersList,
  vouchersList,
  onRefresh,
  notify,
}: Props) {
  // Buat Voucher
  const [vCode, setVCode] = useState('');
  const [vType, setVType] = useState<'percentage' | 'fixed'>('percentage');
  const [vValue, setVValue] = useState('25');
  const [vMaxDisc, setVMaxDisc] = useState('50000');
  const [vMinPurchase, setVMinPurchase] = useState('100000');
  const [vLimit, setVLimit] = useState('100');
  const [vSubmitting, setVSubmitting] = useState(false);

  // Buat User Role
  const [uName, setUName] = useState('');
  const [uEmail, setUEmail] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uBirth, setUBirth] = useState('1995-05-15');
  const [uPass, setUPass] = useState('');
  const [uRole, setURole] = useState<UserRole>('internal_instructor');
  const [uSubmitting, setUSubmitting] = useState(false);

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setVSubmitting(true);
    try {
      await apiFetch('/admin/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          code: vCode.toUpperCase(),
          discount_type: vType,
          discount_value: Number(vValue),
          max_discount: vMaxDisc ? Number(vMaxDisc) : null,
          min_purchase: Number(vMinPurchase || 0),
          usage_limit: vLimit ? Number(vLimit) : null,
        }),
      });
      notify('ok', `Kode voucher ${vCode.toUpperCase()} berhasil diterbitkan!`);
      setVCode('');
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setVSubmitting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUSubmitting(true);
    try {
      await apiFetch('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: uName,
          email: uEmail,
          phone: uPhone,
          birth_date: uBirth,
          password: uPass,
          role: uRole,
        }),
      });
      notify('ok', `Akun ${uEmail} (${getRoleLabel(uRole)}) berhasil dibuat!`);
      setUName('');
      setUEmail('');
      setUPhone('');
      setUPass('');
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    } finally {
      setUSubmitting(false);
    }
  };

  const handleChangeUserRole = async (targetUserId: string, newRole: string) => {
    try {
      await apiFetch(`/admin/users/${targetUserId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      notify('ok', `Role pengguna berhasil diperbarui menjadi ${getRoleLabel(newRole)}`);
      await onRefresh();
    } catch (err: unknown) {
      notify('err', errorMessage(err));
    }
  };

  const statCards = overview
    ? [
        { label: 'Total Pengguna', value: overview.total_users, cls: 'text-slate-900' },
        { label: 'Kursus Terbit', value: overview.published_courses, cls: 'text-blue-700' },
        { label: 'Total Enrollment', value: overview.total_enrollments, cls: 'text-slate-900' },
        {
          label: 'Completion Rate',
          value: `${Number(overview.completion_rate || 0).toFixed(1)}%`,
          cls: 'text-emerald-600',
        },
        { label: 'Sertifikat Terbit', value: overview.total_certificates, cls: 'text-amber-600' },
        {
          label: 'Total Pendapatan',
          value: formatRupiah(overview.total_revenue),
          cls: 'text-emerald-700 text-lg',
        },
      ]
    : [];

  return (
    <div className="space-y-8">
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-[11px] font-semibold text-slate-400">{s.label}</div>
              <div className={`text-2xl font-extrabold mt-1 ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Buat Voucher Diskon (FR-91) */}
        <div className="card p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900">
            Manajemen Kode Voucher Diskon (FR-12, FR-91)
          </h2>

          <form onSubmit={handleCreateVoucher} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Voucher *</label>
                <input
                  type="text"
                  required
                  value={vCode}
                  onChange={(e) => setVCode(e.target.value.toUpperCase())}
                  placeholder="PROMO2026"
                  className="input font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Diskon</label>
                <select
                  value={vType}
                  onChange={(e) => setVType(e.target.value as 'percentage' | 'fixed')}
                  className="input"
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed">Potongan Tetap (Rp)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nilai Diskon *</label>
                <input
                  type="number"
                  required
                  value={vValue}
                  onChange={(e) => setVValue(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Maks. Diskon (Rp)</label>
                <input
                  type="number"
                  value={vMaxDisc}
                  onChange={(e) => setVMaxDisc(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min. Pembelian (Rp)</label>
                <input
                  type="number"
                  value={vMinPurchase}
                  onChange={(e) => setVMinPurchase(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kuota Pakai</label>
                <input
                  type="number"
                  value={vLimit}
                  onChange={(e) => setVLimit(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <button type="submit" disabled={vSubmitting} className="btn-primary w-full text-xs">
              {vSubmitting ? 'Menerbitkan...' : '+ Terbitkan Kode Voucher'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="text-xs font-bold text-slate-700">Daftar Voucher Aktif:</div>
            {vouchersList.map((v) => (
              <div
                key={v.id}
                className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-blue-700">{v.code}</span>
                  <span className="ml-2 text-slate-600">
                    ({v.discount_type === 'percentage' ? `${v.discount_value}%` : formatRupiah(v.discount_value)})
                  </span>
                </div>
                <span className="text-slate-500">
                  Terpakai: {v.used_count} / {v.usage_limit || '∞'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Buat User untuk Semua 6 Role (FR-90) */}
        <div className="card p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900">
            Buat Akun & Kelola 6 Role Pengguna (FR-90)
          </h2>

          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={uName}
                  onChange={(e) => setUName(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={uEmail}
                  onChange={(e) => setUEmail(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor HP</label>
                <input
                  type="tel"
                  value={uPhone}
                  onChange={(e) => setUPhone(e.target.value)}
                  placeholder="0812..."
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pilih Role *</label>
                <select
                  value={uRole}
                  onChange={(e) => setURole(e.target.value as UserRole)}
                  className="input"
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal Lahir *</label>
                <input
                  type="date"
                  required
                  value={uBirth}
                  onChange={(e) => setUBirth(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password Awal *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={uPass}
                  onChange={(e) => setUPass(e.target.value)}
                  placeholder="Min. 8 karakter"
                  className="input font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={uSubmitting}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold"
            >
              {uSubmitting ? 'Membuat Akun...' : '+ Buat Akun Pengguna Baru'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 space-y-2 max-h-64 overflow-y-auto">
            <div className="text-xs font-bold text-slate-700">Daftar Pengguna Terdaftar:</div>
            {usersList.map((u) => (
              <div
                key={u.id}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
              >
                <div className="truncate">
                  <div className="font-bold text-slate-800 truncate">{u.full_name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                </div>
                <select
                  value={u.role}
                  onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                  className="px-2 py-1 rounded-lg border border-slate-300 text-[11px] bg-white font-semibold text-blue-700"
                >
                  {Object.keys(ROLE_LABELS).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
