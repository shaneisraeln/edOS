'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface InterviewReadiness {
  overallScore: number;
  strongTopics: string[];
  weakTopics: string[];
  recommendations: string[];
  estimatedPrepTime: string;
}

export default function InterviewPage() {
  const router = useRouter();
  const [data, setData] = useState<InterviewReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const result = await api.request<InterviewReadiness>('/intelligence/interview-readiness');
      setData(result);
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadData} className="text-sm text-primary-600 hover:text-primary-700 font-medium">Try again</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const scoreColor = data.overallScore >= 70
    ? 'text-green-600'
    : data.overallScore >= 40
      ? 'text-amber-600'
      : 'text-red-500';

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 tracking-tight">Interview Readiness</h1>
        <p className="text-sm text-gray-500">How prepared you are based on your knowledge graph and assessments.</p>
      </header>

      {/* Score ring */}
      <div className="flex flex-col items-center space-y-3">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
            <circle
              cx="60" cy="60" r="52" fill="none" strokeWidth="8" strokeLinecap="round"
              stroke="currentColor"
              className={scoreColor}
              strokeDasharray={`${(data.overallScore / 100) * 327} 327`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-3xl font-bold ${scoreColor}`}>{data.overallScore}</span>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Estimated prep time: <span className="font-medium text-gray-700 dark:text-gray-300">{data.estimatedPrepTime}</span>
        </p>
      </div>

      {/* Strong topics */}
      {data.strongTopics.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Strong Topics</h2>
          <div className="flex flex-wrap gap-2">
            {data.strongTopics.map((topic) => (
              <span key={topic} className="px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
                {topic}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Weak topics */}
      {data.weakTopics.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Weak Topics</h2>
          <div className="flex flex-wrap gap-2">
            {data.weakTopics.map((topic) => (
              <span key={topic} className="px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-medium">
                {topic}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Recommendations</h2>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
          {data.recommendations.map((rec, idx) => (
            <div key={idx} className="flex items-start gap-3 px-5 py-3.5">
              <span className="text-sm mt-0.5">💡</span>
              <p className="text-sm text-gray-700 dark:text-gray-300">{rec}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push('/dashboard/assessment')}
          className="flex-1 px-4 py-3 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors text-center"
        >
          Take Assessment
        </button>
        <button
          onClick={() => router.push('/dashboard/session')}
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-tertiary transition-colors text-center"
        >
          Start Studying
        </button>
      </div>
    </div>
  );
}
