export interface LearningSession {
  id: string;
  userId: string;
  topic: string;
  subtopic?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in seconds
  confidence: number; // 0-100
  resourcesUsed: string[];
  status: SessionStatus;
}

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
}

export interface StartSessionDto {
  topic: string;
  subtopic?: string;
}

export interface EndSessionDto {
  sessionId: string;
  confidence?: number;
}
