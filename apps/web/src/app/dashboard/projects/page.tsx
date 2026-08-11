'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [repository, setRepository] = useState('');
  const [technologies, setTechnologies] = useState('');

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    try { setProjects(await api.request<any[]>('/project/history')); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const createProject = async () => {
    if (!title.trim()) return;
    await api.request<any>('/project/create', { method: 'POST', body: JSON.stringify({ title, description, repository, technologies: technologies.split(',').map(t => t.trim()).filter(Boolean) }) });
    setShowCreate(false); setTitle(''); setDescription(''); setRepository(''); setTechnologies('');
    loadProjects();
  };

  const submitProject = async (id: string) => {
    await api.request<any>('/project/submit', { method: 'POST', body: JSON.stringify({ projectId: id }) });
    loadProjects();
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Projects</h2>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">New Project</button>
        </div>
        {showCreate && (
          <div className="card space-y-4">
            <h3 className="font-semibold">Create Project</h3>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="Project title" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[80px]" placeholder="Description" />
            <input value={repository} onChange={e => setRepository(e.target.value)} className="input" placeholder="Repository URL (optional)" />
            <input value={technologies} onChange={e => setTechnologies(e.target.value)} className="input" placeholder="Technologies (comma separated): React, TypeScript, Node.js" />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={createProject} className="btn-primary flex-1" disabled={!title.trim()}>Create</button>
            </div>
          </div>
        )}

        {projects.length === 0 && !showCreate ? (
          <div className="card text-center py-12 space-y-4">
            <span className="text-4xl">🏗️</span>
            <h2 className="text-lg font-semibold">No projects yet</h2>
            <p className="text-sm text-gray-500">Projects contribute directly to your mastery score.</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">Create Your First Project</button>
          </div>
        ) : (
          projects.map(p => (
            <div key={p.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{p.description || 'No description'}</p>
                  {p.technologies?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.technologies.map((t: string) => <span key={t} className="text-xs px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 rounded">{t}</span>)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded capitalize ${p.status === 'submitted' ? 'bg-green-50 text-green-700' : p.status === 'reviewed' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                  {p.score !== null && <p className="text-lg font-bold text-primary-600 mt-1">{p.score}%</p>}
                </div>
              </div>
              {p.status === 'in_progress' && (
                <button onClick={() => submitProject(p.id)} className="btn-secondary text-sm mt-3 w-full">Submit for AI Review</button>
              )}
              {p.aiFeedback && (
                <div className="mt-3 p-3 bg-surface-tertiary dark:bg-dark-tertiary rounded-lg text-sm">
                  <p className="font-medium text-xs text-gray-500 mb-1">AI Feedback</p>
                  <p>{(p.aiFeedback as any).summary || 'Reviewed.'}</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
