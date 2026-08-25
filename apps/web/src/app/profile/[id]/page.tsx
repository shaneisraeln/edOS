'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Badge,
  Card,
  Icon,
  List,
  ListRow,
  Page,
  PageHeader,
  PageLoading,
  ProgressBar,
  Section,
  Stat,
} from '@/components/ui';

interface VerifiedSkill {
  conceptId: string;
  name: string;
  mastery: number;
  lastAssessed: string;
}

interface AssessmentRecord {
  id: string;
  topic: string;
  score: number;
  maxScore: number;
  completedAt: string;
}

interface ProjectRecord {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  status: string;
  score: number | null;
}

interface ProfileData {
  user: { id: string; name: string; createdAt: string };
  verifiedSkills: VerifiedSkill[];
  assessmentHistory: AssessmentRecord[];
  projects: ProjectRecord[];
  learningVelocity: number;
  stats: { totalVerifiedSkills: number; totalAssessments: number; totalProjects: number };
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .request<ProfileData>(`/recruiter/profile/${userId}`)
      .then(setProfile)
      .catch((err: any) => setError(err.message || 'Profile not found'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <PageLoading />;

  if (error || !profile) {
    return (
      <Page width="narrow">
        <div className="py-20 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Profile not found</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        title={profile.user.name}
        description={`Member since ${new Date(profile.user.createdAt).toLocaleDateString()} · ${profile.learningVelocity} sessions a week`}
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Verified skills" value={profile.stats.totalVerifiedSkills} />
        <Stat label="Assessments" value={profile.stats.totalAssessments} />
        <Stat label="Projects" value={profile.stats.totalProjects} />
      </div>

      {profile.verifiedSkills.length > 0 && (
        <Section
          title="Verified skills"
          description="Backed by assessment evidence, not self-reported."
        >
          <List>
            {profile.verifiedSkills.map((skill) => (
              <ListRow key={skill.conceptId}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <Icon name="check" className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400" />
                    <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                      {skill.name}
                    </span>
                  </span>
                  <span className="mt-1.5 block">
                    <ProgressBar value={skill.mastery} label={`${skill.name} mastery`} />
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  {Math.round(skill.mastery)}%
                </span>
              </ListRow>
            ))}
          </List>
        </Section>
      )}

      {profile.projects.length > 0 && (
        <Section title="Projects">
          <div className="space-y-3">
            {profile.projects.map((project) => (
              <Card key={project.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {project.title}
                    </p>
                    {project.description && (
                      <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {project.description}
                      </p>
                    )}
                    {project.technologies.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {project.technologies.map((tech) => (
                          <Badge key={tech}>{tech}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {project.score !== null && (
                    <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                      {Math.round(project.score)}%
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {profile.assessmentHistory.length > 0 && (
        <Section title="Assessment history">
          <List>
            {profile.assessmentHistory.slice(0, 10).map((assessment) => (
              <ListRow key={assessment.id}>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                    {assessment.topic}
                  </span>
                  <span className="mt-0.5 block text-2xs text-gray-500 dark:text-gray-400">
                    {new Date(assessment.completedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                  {assessment.score}/{assessment.maxScore}
                </span>
              </ListRow>
            ))}
          </List>
        </Section>
      )}

      <footer className="border-t pt-6">
        <p className="text-2xs text-gray-500 dark:text-gray-400">
          Verified by edOS. Skill data is derived from assessments and observed practice.
        </p>
      </footer>
    </Page>
  );
}
