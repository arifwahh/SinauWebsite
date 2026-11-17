'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getStoredUser, isStaffRole } from '@/lib/auth';
import { errorMessage, getRoleLabel } from '@/lib/format';
import type { AdminOverview, AuthUser, Category, CourseWithModules, UserRole, Voucher } from '@/lib/types';
import CuratorTab from './CuratorTab';
import InstructorTab from './InstructorTab';
import SuperAdminTab from './SuperAdminTab';

type TabKey = 'instructor' | 'curator' | 'super_admin';

function allowedTabsForRole(role: UserRole): { key: TabKey; label: string }[] {
  if (role === 'super_admin') {
    return [
      { key: 'instructor', label: '👨‍🏫 Tab Instruktur' },
      { key: 'curator', label: '🔍 Tab Kurator' },
      { key: 'super_admin', label: '🛡️ Tab Super Admin' },
    ];
  }
  if (role === 'curator') {
    return [{ key: 'curator', label: '🔍 Tab Kurator' }];
  }
  return [{ key: 'instructor', label: '👨‍🏫 Tab Instruktur' }];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('instructor');

  const [categories, setCategories] = useState<Category[]>([]);
  const [courses, setCourses] = useState<CourseWithModules[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [usersList, setUsersList] = useState<AuthUser[]>([]);
  const [vouchersList, setVouchersList] = useState<Voucher[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const notify = useCallback((type: 'ok' | 'err', msg: string) => {
    setFeedback({ type, msg });
  }, []);

  const loadDashboardData = useCallback(
    async (currentUser: AuthUser) => {
      try {
        const baseReqs = [
          apiFetch<{ data: Category[] }>('/categories'),
          apiFetch<{ data: CourseWithModules[] }>('/admin/courses'),
        ] as const;

        if (currentUser.role === 'super_admin') {
          const [catRes, courseRes, ovRes, usrRes, vchRes] = await Promise.all([
            ...baseReqs,
            apiFetch<{ data: AdminOverview }>('/admin/analytics/overview'),
            apiFetch<{ data: AuthUser[] }>('/admin/users'),
            apiFetch<{ data: Voucher[] }>('/admin/vouchers'),
          ]);
          setCategories(catRes.data || []);
          setCourses(courseRes.data || []);
          setOverview(ovRes.data);
          setUsersList(usrRes.data || []);
          setVouchersList(vchRes.data || []);
        } else {
          const [catRes, courseRes] = await Promise.all(baseReqs);
          setCategories(catRes.data || []);
          setCourses(courseRes.data || []);
        }
      } catch (err: unknown) {
        notify('err', errorMessage(err, 'Gagal memuat data dashboard'));
      }
    },
    [notify]
  );

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.push('/login');
      return;
    }
    if (!isStaffRole(u.role)) {
      router.push('/');
      return;
    }
    setUser(u);
    if (u.role === 'curator') setActiveTab('curator');
    else if (u.role === 'super_admin') setActiveTab('super_admin');
    else setActiveTab('instructor');

    loadDashboardData(u);
  }, [router, loadDashboardData]);

  const tabs = user ? allowedTabsForRole(user.role) : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard Manajemen Sinau</h1>
          <p className="text-xs text-slate-500 mt-1">
            Login sebagai: <strong>{user?.full_name}</strong> ({user ? getRoleLabel(user.role) : ''})
          </p>
        </div>

        {tabs.length > 1 && (
          <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between ${
            feedback.type === 'ok' ? 'alert-success' : 'alert-error'
          }`}
        >
          <span>{feedback.msg}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-4 font-bold underline"
          >
            Tutup
          </button>
        </div>
      )}

      {activeTab === 'instructor' && (
        <InstructorTab
          categories={categories}
          courses={courses}
          onRefresh={() => (user ? loadDashboardData(user) : Promise.resolve())}
          notify={notify}
        />
      )}

      {activeTab === 'curator' && (
        <CuratorTab
          courses={courses}
          onRefresh={() => (user ? loadDashboardData(user) : Promise.resolve())}
          notify={notify}
        />
      )}

      {activeTab === 'super_admin' && user?.role === 'super_admin' && (
        <SuperAdminTab
          overview={overview}
          usersList={usersList}
          vouchersList={vouchersList}
          onRefresh={() => loadDashboardData(user)}
          notify={notify}
        />
      )}
    </div>
  );
}
