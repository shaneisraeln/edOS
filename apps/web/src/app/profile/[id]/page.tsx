'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

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
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      const data = await api.request<ProfileData>('/recruiter/profile/' + userId);
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'Profile not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-gray-900">Profile not found</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Header */}
        <header className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto text-2xl">
            {profile.user.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{profile.user.name}</h1>
          <p className="text-sm text-gray-500">
            Member since {new Date(profile.user.createdAt).toLocaleDateString()} · {profile.learningVelocity} sessions/week
          </p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface px-4 py-3.5 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{profile.stats.totalVerifiedSkills}</p>
            <p className="text-[11px] text-gray-400">Verified Skills</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface px-4 py-3.5 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{profile.stats.totalAssessments}</p>
            <p className="text-[11px] text-gray-400">Assessments</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface px-4 py-3.5 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{profile.stats.totalProjects}</p>
            <p className="text-[11px] text-gray-400">Projects</p>
          </div>
        </div>

        {/* Verified Skills */}
        {profile.verifiedSkills.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Verified Skills</h2>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
              {profile.verifiedSkills.map((skill) => (
                <div key={skill.conceptId} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{skill.name}</span>
                    <span className="ml-2 text-xs text-green-600">✓ Verified</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${skill.mastery}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums font-medium text-gray-600 dark:text-gray-400 w-8 text-right">
                      {skill.mastery}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        {profile.projects.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Projects</h2>
            <div className="grid gap-3">
              {profile.projects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.title}</p>
                      {project.description && (
                        <p className="text-xs text-gray-500 mt-1">{project.description}</p>
                      )}
                      {project.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {project.technologies.map((tech) => (
                            <span key={tech} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {project.score !== null && (
                      <span className="text-sm font-medium text-primary-600">{project.score}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Assessment History */}
        {profile.assessmentHistory.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Assessment History</h2>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-dark-surface divide-y divide-gray-100 dark:divide-gray-800">
              {profile.assessmentHistory.slice(0, 10).map((assessment) => (
                <div key={assessment.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{assessment.topic}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(assessment.completedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums font-medium text-gray-600 dark:text-gray-400">
                    {assessment.score}/{assessment.maxScore}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center">
          <p className="text-xs text-gray-400">Verified by edOS · Skill data backed by assessments and practice</p>
        </footer>
      </div>
    </div>
  );
}
