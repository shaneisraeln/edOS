'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function CollegeDashboard() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [weaknesses, setWeaknesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [stuData, weakData] = await Promise.all([
        api.request<any>('/college/students'),
        api.request<any>('/college/weaknesses'),
      ]);
      setStudents(stuData.students || []);
      setWeaknesses(weakData || []);
    } catch (e: any) {
      if (e.message?.includes('403')) { router.push('/dashboard'); }
    } finally { setLoading(false); }
  };

  const loadStudent = async (id: string) => {
    const detail = await api.request<any>(`/college/students/${id}`);
    setSelected(detail);
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></main>;

  return (
    <main className="min-h-screen bg-surface-secondary dark:bg-dark p-6">
      <header className="flex items-center justify-between mb-8 max-w-6xl mx-auto">
        <button onClick={() => router.push('/dashboard')} className="text-sm text-gray-500">← Dashboard</button>
        <h1 className="text-lg font-semibold">Faculty Dashboard</h1>
        <div />
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-3">Students ({students.length})</h2>
            <div className="space-y-2">
              {students.map((s: any) => (
                <button key={s.id} onClick={() => loadStudent(s.id)} className="w-full text-left p-3 rounded-lg hover:bg-surface-tertiary dark:hover:bg-dark-tertiary transition-colors">
                  <div className="flex justify-between">
                    <div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-gray-400">{s.email}</p></div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary-600">{s.averageMastery}%</p>
                      <p className="text-xs text-gray-400">{s.conceptCount} concepts</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold mb-3">Class-Wide Weaknesses</h2>
            {weaknesses.length > 0 ? weaknesses.slice(0, 10).map((w: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <span>{w.topic}</span>
                <span className="text-orange-500 font-medium">{Math.round(parseFloat(w.avgWeakness))}% weak</span>
              </div>
            )) : <p className="text-sm text-gray-400">No data yet</p>}
          </div>
        </div>

        <div>
          {selected ? (
            <div className="card sticky top-6 space-y-3">
              <h3 className="font-semibold">{selected.student?.name}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Avg Mastery</span><span className="font-bold">{selected.stats?.averageMastery}%</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Concepts</span><span>{selected.stats?.totalConcepts}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Strong</span><span className="text-green-600">{selected.stats?.strongConcepts}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Weak</span><span className="text-orange-500">{selected.stats?.weakConcepts}</span></div>
              </div>
            </div>
          ) : (
            <div className="card text-center py-8"><p className="text-sm text-gray-400">Select a student</p></div>
          )}
        </div>
      </div>
    </main>
  );
}
