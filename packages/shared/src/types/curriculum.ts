export interface Curriculum {
  id: string;
  name: string;
  description: string;
  modules: CurriculumModule[];
  createdAt: Date;
}

export interface CurriculumModule {
  id: string;
  name: string;
  description?: string;
  order: number;
  topics: CurriculumTopic[];
}

export interface CurriculumTopic {
  id: string;
  name: string;
  description?: string;
  order: number;
  skills: string[];
  prerequisites: string[];
  learningOutcomes: string[];
  suggestedResources?: string[];
}

export interface LearningGoal {
  id: string;
  userId: string;
  curriculumId: string;
  curriculum?: Curriculum;
  targetDate?: Date;
  status: GoalStatus;
  skillLevel: SkillLevel;
  createdAt: Date;
}

export enum GoalStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  ABANDONED = 'abandoned',
}

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}
