'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Phase = 'setup' | 'loading' | 'questions' | 'submitting' | 'results';

interface Question {
  id: string;
  text: string;
  type: string;
  options?: string[];
  maxScore: number;
}

interface AssessmentResult {
  id: string;
  score: number;
  maxScore: number;
  feedback: string;
  questions: any[];
}

export default function AssessmentPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [concepts, setConcepts] = useState<{ id: string; name: string }[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConcepts();
  }, []);

  const loadConcepts = async () => {
    try {
      const data = await api.getConcepts();
      setConcepts(data.map((c: any) => ({ id: c.id, name: c.name })));
    } catch (e) {
      // If concepts aren't loaded, user can still type a topic
    }
  };

  const generateAssessment = async () => {
    if (!topic.trim()) return;
    setError('');
    setPhase('loading');

    try {
      const assessment = await api.generateAssessment(topic, {
        difficulty,
        questionCount: 5,
      });
      setAssessmentId(assessment.id);
      setQuestions(assessment.questions || []);
      setAnswers({});
      setPhase('questions');
    } catch (err: any) {
      setError(err.message || 'Failed to generate assessment');
      setPhase('setup');
    }
  };

  const submitAssessment = async () => {
    const answerList = questions.map((q) => ({
      questionId: q.id,
      answer: answers[q.id] || '',
    }));

    setPhase('submitting');

    try {
      const res = await api.submitAssessment(assessmentId, answerList);
      setResult(res);
      setPhase('results');
    } catch (err: any) {
      setError(err.message || 'Failed to submit');
      setPhase('questions');
    }
  };

  const answeredCount = Object.values(answers).filter((a) => a.trim()).length;

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Setup Phase */}
        {phase === 'setup' && (
          <div className="card space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Take an Assessment</h2>
              <p className="text-sm text-gray-500">
                Test your understanding. AI generates questions based on your chosen topic.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic</label>
                {concepts.length > 0 ? (
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="input"
                  >
                    <option value="">Select a topic or type below...</option>
                    {concepts.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="input"
                  placeholder="e.g., Neural Networks, React Hooks, Pandas..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Difficulty</label>
                <div className="flex gap-2">
                  {['beginner', 'intermediate', 'advanced'].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-4 py-2 rounded-lg text-sm capitalize transition-all ${
                        difficulty === d
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 dark:bg-dark-tertiary text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={generateAssessment}
              className="btn-primary w-full"
              disabled={!topic.trim()}
            >
              Generate Assessment
            </button>
          </div>
        )}

        {/* Loading Phase */}
        {phase === 'loading' && (
          <div className="card text-center py-12 space-y-4">
            <div className="animate-pulse">
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 mx-auto flex items-center justify-center">
                <span className="text-2xl">🧠</span>
              </div>
            </div>
            <p className="text-gray-500">Generating questions about <strong>{topic}</strong>...</p>
            <p className="text-xs text-gray-400">Using AI to create contextual assessment</p>
          </div>
        )}

        {/* Questions Phase */}
        {phase === 'questions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{topic} — {difficulty}</h2>
              <span className="text-sm text-gray-500">
                {answeredCount}/{questions.length} answered
              </span>
            </div>

            {questions.map((q, idx) => (
              <div key={q.id} className="card space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 flex items-center justify-center text-sm font-medium">
                    {idx + 1}
                  </span>
                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-medium leading-relaxed">{q.text}</p>

                    {q.options && q.options.length > 0 ? (
                      <div className="space-y-2">
                        {q.options.map((opt, optIdx) => (
                          <button
                            key={optIdx}
                            onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm border transition-all ${
                              answers[q.id] === opt
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={answers[q.id] || ''}
                        onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        className="input min-h-[100px] resize-y"
                        placeholder="Type your answer here..."
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-3">
              <button
                onClick={() => { setPhase('setup'); setQuestions([]); setAnswers({}); }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={submitAssessment}
                className="btn-primary flex-1"
                disabled={answeredCount === 0}
              >
                Submit ({answeredCount}/{questions.length})
              </button>
            </div>
          </div>
        )}

        {/* Submitting Phase */}
        {phase === 'submitting' && (
          <div className="card text-center py-12 space-y-4">
            <div className="animate-pulse">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
            </div>
            <p className="text-gray-500">Scoring your answers...</p>
          </div>
        )}

        {/* Results Phase */}
        {phase === 'results' && result && (
          <div className="space-y-6">
            <div className="card text-center space-y-4">
              <h2 className="text-xl font-bold">Assessment Complete</h2>
              <div className="flex items-center justify-center gap-2">
                <span className="text-5xl font-bold text-primary-600">
                  {Math.round((result.score / result.maxScore) * 100)}%
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Score: {result.score} / {result.maxScore}
              </p>
              {result.feedback && (
                <p className="text-sm text-gray-600 dark:text-gray-400 bg-surface-tertiary dark:bg-dark-tertiary rounded-lg p-4">
                  {result.feedback}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setPhase('setup'); setTopic(''); setResult(null); }}
                className="btn-secondary flex-1"
              >
                Take Another
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="btn-primary flex-1"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
