export interface Assessment {
  id: string;
  userId: string;
  topic: string;
  subtopic?: string;
  difficulty: AssessmentDifficulty;
  type: AssessmentType;
  questions: AssessmentQuestion[];
  score?: number;
  maxScore: number;
  status: AssessmentStatus;
  generatedAt: Date;
  completedAt?: Date;
  feedback?: string;
}

export enum AssessmentDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum AssessmentType {
  CONCEPT_EXPLANATION = 'concept_explanation',
  CODING_CHALLENGE = 'coding_challenge',
  MCQ = 'mcq',
  DEBUGGING = 'debugging',
  CASE_STUDY = 'case_study',
  PRACTICAL_TASK = 'practical_task',
  DIAGRAM = 'diagram',
}

export enum AssessmentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  type: AssessmentType;
  options?: string[]; // for MCQ
  expectedAnswer?: string;
  userAnswer?: string;
  score?: number;
  maxScore: number;
  feedback?: string;
}

export interface GenerateAssessmentDto {
  topic: string;
  subtopic?: string;
  difficulty?: AssessmentDifficulty;
  type?: AssessmentType;
  questionCount?: number;
}

export interface SubmitAssessmentDto {
  assessmentId: string;
  answers: { questionId: string; answer: string }[];
}
