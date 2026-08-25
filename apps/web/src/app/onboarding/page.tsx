'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Button, Icon, type IconName } from '@/components/ui';

const CURRICULA: { id: string; name: string; description: string; icon: IconName }[] = [
  { id: 'ml', name: 'Machine learning', description: 'Models, training, evaluation', icon: 'sparkle' },
  { id: 'web-dev', name: 'Web development', description: 'Frontend, backend, APIs', icon: 'globe' },
  { id: 'data-science', name: 'Data science', description: 'Analysis, statistics, viz', icon: 'graph' },
  { id: 'cloud', name: 'Cloud computing', description: 'Infra, deployment, scale', icon: 'desktop' },
  { id: 'cyber-sec', name: 'Cyber security', description: 'Threats, defence, crypto', icon: 'shield' },
  { id: 'ai-eng', name: 'AI engineering', description: 'LLMs, agents, pipelines', icon: 'terminal' },
];

const SKILL_LEVELS = [
  { id: 'beginner', label: 'Beginner', description: 'Starting from the fundamentals.' },
  { id: 'intermediate', label: 'Intermediate', description: 'Comfortable with the basics.' },
  { id: 'advanced', label: 'Advanced', description: 'Chasing depth and edge cases.' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [curriculum, setCurriculum] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const complete = async () => {
    if (!curriculum || !level) return;
    setLoading(true);
    setError('');

    try {
      const chosen = CURRICULA.find((c) => c.id === curriculum)!;
      await api.setGoal(curriculum, chosen.name, level);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Could not save your goal. You can set it later in the dashboard.');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg animate-in">
        <div className="mb-8 flex items-center gap-1.5">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-0.5 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-200 dark:bg-gray-800'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-5">
            <Alert>{error}</Alert>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <p className="text-2xs text-gray-500 dark:text-gray-400">Step 1 of 2</p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50">
                What are you learning?
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This seeds your knowledge graph. You can add more later.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CURRICULA.map((c) => {
                const selected = curriculum === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCurriculum(c.id)}
                    aria-pressed={selected}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? 'border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-dark-tertiary'
                        : 'bg-surface hover:border-gray-300 dark:bg-dark-surface dark:hover:border-gray-700'
                    }`}
                  >
                    <Icon
                      name={c.icon}
                      className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                        {c.name}
                      </span>
                      <span className="mt-0.5 block text-2xs text-gray-500 dark:text-gray-400">
                        {c.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <Button variant="primary" block onClick={() => setStep(2)} disabled={!curriculum}>
              Continue
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <p className="text-2xs text-gray-500 dark:text-gray-400">Step 2 of 2</p>
              <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50">
                Where are you starting from?
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Used to calibrate how hard your first questions are.
              </p>
            </div>

            <div className="space-y-2">
              {SKILL_LEVELS.map((l) => {
                const selected = level === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLevel(l.id)}
                    aria-pressed={selected}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? 'border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-dark-tertiary'
                        : 'bg-surface hover:border-gray-300 dark:bg-dark-surface dark:hover:border-gray-700'
                    }`}
                  >
                    <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      {l.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {l.description}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={complete}
                loading={loading}
                disabled={!level}
              >
                Start learning
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
