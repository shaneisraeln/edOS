'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Page,
  PageHeader,
  PageLoading,
  Textarea,
} from '@/components/ui';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [repository, setRepository] = useState('');
  const [technologies, setTechnologies] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setProjects(await api.request<any[]>('/project/history'));
    } catch (err: any) {
      setError(err.message || 'Could not load your projects');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError('');

    try {
      await api.request<any>('/project/create', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          repository,
          technologies: technologies
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setRepository('');
      setTechnologies('');
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Could not create the project');
    } finally {
      setSaving(false);
    }
  };

  const submitProject = async (id: string) => {
    setSubmittingId(id);
    setError('');
    try {
      await api.request<any>('/project/submit', {
        method: 'POST',
        body: JSON.stringify({ projectId: id }),
      });
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Could not submit for review');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <Page>
      <PageHeader
        title="Projects"
        description="Building something is the strongest evidence of mastery."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
            New project
          </Button>
        }
      />

      {error && <Alert>{error}</Alert>}

      {projects.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No projects yet"
          description="Add a project, then submit it for review to feed your mastery score."
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              Create a project
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p.id} className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.title}</h2>
                  {p.description && (
                    <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {p.description}
                    </p>
                  )}
                  {p.technologies?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.technologies.map((t: string) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <Badge tone={statusTone(p.status)}>{formatStatus(p.status)}</Badge>
                  {p.score !== null && p.score !== undefined && (
                    <p className="mt-1.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                      {Math.round(p.score)}%
                    </p>
                  )}
                </div>
              </div>

              {p.repository && (
                <a
                  href={p.repository}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-2xs text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  View repository
                </a>
              )}

              {p.status === 'in_progress' && (
                <Button
                  block
                  size="sm"
                  onClick={() => submitProject(p.id)}
                  loading={submittingId === p.id}
                >
                  Submit for review
                </Button>
              )}

              {p.aiFeedback && <ProjectFeedback feedback={p.aiFeedback} />}
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New project"
        description="Describe what you built. You can submit it for review once it exists."
        footer={
          <>
            <Button onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" onClick={createProject} loading={saving} disabled={!title.trim()}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Realtime chat with presence"
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What it does, and what was hard about it"
          />
          <Input
            label="Repository"
            hint="Optional"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="https://github.com/you/project"
          />
          <Input
            label="Technologies"
            hint="Comma separated"
            value={technologies}
            onChange={(e) => setTechnologies(e.target.value)}
            placeholder="React, TypeScript, Postgres"
          />
        </div>
      </Dialog>
    </Page>
  );
}

function ProjectFeedback({ feedback }: { feedback: any }) {
  const summary = feedback?.summary || feedback?.feedback;
  const strengths: string[] = feedback?.strengths || [];
  const improvements: string[] = feedback?.improvements || [];

  return (
    <div className="space-y-3 rounded-lg border p-3.5">
      <p className="text-2xs text-gray-500 dark:text-gray-400">Review</p>
      {summary && (
        <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">{summary}</p>
      )}

      {strengths.length > 0 && (
        <div>
          <p className="text-2xs text-gray-500 dark:text-gray-400">What works</p>
          <ul className="mt-1 space-y-1">
            {strengths.map((s) => (
              <li key={s} className="text-xs text-gray-700 dark:text-gray-300">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {improvements.length > 0 && (
        <div>
          <p className="text-2xs text-gray-500 dark:text-gray-400">Next steps</p>
          <ul className="mt-1 space-y-1">
            {improvements.map((s) => (
              <li key={s} className="text-xs text-gray-700 dark:text-gray-300">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatStatus(status: string): string {
  return String(status || '').replace(/_/g, ' ');
}

function statusTone(status: string): 'neutral' | 'accent' | 'success' {
  if (status === 'reviewed') return 'success';
  if (status === 'submitted') return 'accent';
  return 'neutral';
}
