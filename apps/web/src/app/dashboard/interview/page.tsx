'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Badge,
  ButtonLink,
  Card,
  ErrorState,
  Icon,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  Section,
} from '@/components/ui';

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
    if (!localStorage.getItem('accessToken')) {
      router.push('/login');
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    setError('');
    try {
      setData(await api.request<InterviewReadiness>('/intelligence/interview-readiness'));
    } catch (err: any) {
      if (err.message?.includes('401')) {
        router.push('/login');
        return;
      }
      setError(err.message || 'Could not load your readiness score');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <PageLoading />;

  if (error) {
    return (
      <Page width="narrow">
        <PageHeader title="Interview readiness" />
        <ErrorState message={error} onRetry={loadData} />
      </Page>
    );
  }

  if (!data) return null;

  return (
    <Page width="narrow">
      <PageHeader
        title="Interview readiness"
        description="Derived from your knowledge graph, assessment history and topic coverage."
      />

      <Card className="flex flex-col items-center gap-4 py-10">
        <ScoreRing score={data.overallScore} />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Estimated prep time{' '}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {data.estimatedPrepTime}
          </span>
        </p>
      </Card>

      {data.strongTopics.length > 0 && (
        <Section title="Strong topics" description="You can speak to these with confidence.">
          <div className="flex flex-wrap gap-1.5">
            {data.strongTopics.map((topic) => (
              <Badge key={topic} tone="success">
                {topic}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {data.weakTopics.length > 0 && (
        <Section title="Needs work" description="Most likely to catch you out.">
          <div className="flex flex-wrap gap-1.5">
            {data.weakTopics.map((topic) => (
              <Badge key={topic} tone="danger">
                {topic}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {data.recommendations.length > 0 && (
        <Section title="What to do next">
          <List>
            {data.recommendations.map((rec, idx) => (
              <ListRow key={idx} className="items-start">
                <span className="flex items-start gap-2.5">
                  <Icon
                    name="lightbulb"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{rec}</span>
                </span>
              </ListRow>
            ))}
          </List>
        </Section>
      )}

      <div className="flex gap-2">
        <ButtonLink href="/dashboard/assessment" variant="primary" className="flex-1">
          Take an assessment
        </ButtonLink>
        <ButtonLink href="/dashboard/session" className="flex-1">
          Start studying
        </ButtonLink>
      </div>
    </Page>
  );
}

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  // Monochrome ring; the number carries the meaning, not the colour.
  return (
    <div className="relative h-32 w-32">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-gray-200 dark:stroke-gray-800"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          className="stroke-gray-900 transition-[stroke-dasharray] duration-500 dark:stroke-gray-100"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-50"
          role="img"
          aria-label={`Readiness score ${clamped} out of 100`}
        >
          {clamped}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">out of 100</span>
      </div>
    </div>
  );
}
