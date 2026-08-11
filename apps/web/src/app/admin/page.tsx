'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function AdminDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'users' | 'audit'>('overview');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [anal, usersData, logs] = await Promise.all([
        api.request<any>('/admin/analytics'),
        api.request<any>('/admin/users'),
        api.request<any>('/admin/audit'),
      ]);
      setAnalytics(anal);
      setUsers(usersData.users || []);
      setAuditLogs(logs.logs || []);
    } catch (e: any) {
      if (e.message?.includes('403')) router.push('/dashboard');
    } finally { setLoading(false); }
  };

  const changeRole = async (userId: string, role: string) => {
    await api.request<any>('/admin/users/role', { method: 'PATCH', body: JSON.stringify({ userId, role }) });
    load();
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></main>;

  return (
    <main className="min-h-screen bg-surface-secondary dark:bg-dark p-6">
      <header className="flex items-center justify-between mb-8 max-w-6xl mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-500">← Dashboard</button>
        <h1 className="text-lg font-semibold">Admin Dashboard</h1>
        <div />
      </header>

      <div className="max-w-6xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'users', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm capitalize ${tab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-dark-tertiary'}`}>{t}</button>
          ))}
        </div>

        {tab === 'overview' && analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card text-center"><p className="text-xs text-gray-500">Users</p><p className="text-2xl font-bold text-primary-600">{analytics.totalUsers}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500">Sessions</p><p className="text-2xl font-bold text-primary-600">{analytics.totalSessions}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500">Assessments</p><p className="text-2xl font-bold text-primary-600">{analytics.totalAssessments}</p></div>
            <div className="card text-center"><p className="text-xs text-gray-500">Concepts</p><p className="text-2xl font-bold text-primary-600">{analytics.totalConcepts}</p></div>
          </div>
        )}

        {tab === 'users' && (
          <div className="card">
            <div className="space-y-2">
              {users.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div><p className="text-sm font-medium">{u.name}</p><p className="text-xs text-gray-400">{u.email}</p></div>
                  <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className="input w-32 text-xs">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="card">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{log.action}</span>
                    <span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500">{log.resource} {log.resourceId || ''}</p>
                </div>
              ))}
              {auditLogs.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No audit logs yet</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
