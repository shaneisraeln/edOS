'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const CURRICULA = [
  { id: 'ml', name: 'Machine Learning', icon: '🤖' },
  { id: 'web-dev', name: 'Web Development', icon: '🌐' },
  { id: 'data-science', name: 'Data Science', icon: '📊' },
  { id: 'cloud', name: 'Cloud Computing', icon: '☁️' },
  { id: 'cyber-sec', name: 'Cyber Security', icon: '🔒' },
  { id: 'ai-eng', name: 'AI Engineering', icon: '🧠' },
];

const SKILL_LEVELS = [
  { id: 'beginner', label: 'Beginner', description: 'Just getting started' },
  { id: 'intermediate', label: 'Intermediate', description: 'Some prior knowledge' },
  { id: 'advanced', label: 'Advanced', description: 'Deep understanding, want mastery' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedCurriculum, setSelectedCurriculum] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!selectedCurriculum || !selectedLevel) return;
    setLoading(true);

    try {
      const curriculum = CURRICULA.find((c) => c.id === selectedCurriculum);
      await api.setGoal(selectedCurriculum, curriculum!.name, selectedLevel);
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to set goal:', err);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Progress */}
        <div className="flex justify-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 w-16 rounded-full ${
                s <= step ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">What do you want to learn?</h1>
              <p className="text-sm text-gray-500">Choose your primary learning goal</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {CURRICULA.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCurriculum(c.id)}
                  className={`card text-left transition-all ${
                    selectedCurriculum === c.id
                      ? 'ring-2 ring-primary-500 border-primary-500'
                      : 'hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span className="text-2xl">{c.icon}</span>
                  <p className="mt-2 font-medium text-sm">{c.name}</p>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="btn-primary w-full"
              disabled={!selectedCurriculum}
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Your current skill level?</h1>
              <p className="text-sm text-gray-500">This helps us calibrate assessments</p>
            </div>

            <div className="space-y-3">
              {SKILL_LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className={`card w-full text-left transition-all ${
                    selectedLevel === level.id
                      ? 'ring-2 ring-primary-500 border-primary-500'
                      : 'hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <p className="font-medium">{level.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{level.description}</p>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1">
                Back
              </button>
              <button
                onClick={handleComplete}
                className="btn-primary flex-1"
                disabled={!selectedLevel || loading}
              >
                {loading ? 'Setting up...' : 'Start Learning'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
