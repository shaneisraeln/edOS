'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Alert,
  Card,
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  Segmented,
  Select,
  Stat,
  StatGrid,
} from '@/components/ui';

type Tab = 'overview' | 'users' | 'audit';

export default function AdminDashboard() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

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
    } catch (err: any) {
      if (err.message?.includes('403')) {
        router.push('/dashboard');
        return;
      }
      setError(err.message || 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (userId: string, role: string) => {
    setError('');
    try {
      await api.request<any>('/admin/users/role', {
        method: 'PATCH',
        body: JSON.stringify({ userId, role }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not change that role');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <Page width="wide">
      <PageHeader
        title="Admin"
        description="Platform totals, user roles and the audit trail."
        backTo={{ href: '/dashboard', label: 'Dashboard' }}
      />

      {error && <Alert>{error}</Alert>}

      <Segmented
        aria-label="Admin section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'users', label: 'Users' },
          { value: 'audit', label: 'Audit' },
        ]}
      />

      {tab === 'overview' && analytics && (
        <StatGrid>
          <Stat label="Users" value={analytics.totalUsers ?? 0} />
          <Stat label="Sessions" value={analytics.totalSessions ?? 0} />
          <Stat label="Assessments" value={analytics.totalAssessments ?? 0} />
          <Stat label="Concepts" value={analytics.totalConcepts ?? 0} />
        </StatGrid>
      )}

      {tab === 'users' && (
        <List>
          {users.map((u: any) => (
            <ListRow key={u.id}>
              <span className="min-w-0">
                <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                  {u.name}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-gray-500 dark:text-gray-400">
                  {u.email}
                </span>
              </span>
              <Select
                value={u.role}
                onChange={(e) => changeRole(u.id, e.target.value)}
                aria-label={`Role for ${u.name}`}
                className="w-32 shrink-0 py-1.5 text-xs"
              >
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </Select>
            </ListRow>
          ))}
        </List>
      )}

      {tab === 'audit' &&
        (auditLogs.length === 0 ? (
          <EmptyState icon="shield" title="No audit entries" description="Actions will be recorded here." />
        ) : (
          <List>
            {auditLogs.map((log: any) => (
              <ListRow key={log.id}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                    {log.action}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-gray-500 dark:text-gray-400">
                    {log.resource} {log.resourceId || ''}
                  </span>
                </span>
                <span className="shrink-0 text-2xs text-gray-500 dark:text-gray-400">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </ListRow>
            ))}
          </List>
        ))}
    </Page>
  );
}
