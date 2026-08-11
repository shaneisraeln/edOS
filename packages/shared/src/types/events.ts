export interface LearningEvent {
  eventId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  eventType: EventType;
  source: EventSource;
  topic?: string;
  subtopic?: string;
  metadata: Record<string, unknown>;
}

export enum EventType {
  BROWSER_OPENED = 'BrowserOpened',
  PAGE_VISITED = 'PageVisited',
  LEARNING_STARTED = 'LearningStarted',
  LEARNING_ENDED = 'LearningEnded',
  AI_CONVERSATION = 'AIConversation',
  CODING_STARTED = 'CodingStarted',
  CODING_ENDED = 'CodingEnded',
  ASSESSMENT_STARTED = 'AssessmentStarted',
  ASSESSMENT_COMPLETED = 'AssessmentCompleted',
  PROJECT_CREATED = 'ProjectCreated',
  PROJECT_SUBMITTED = 'ProjectSubmitted',
  DOCUMENT_OPENED = 'DocumentOpened',
  SEARCH_PERFORMED = 'SearchPerformed',
  NOTE_TAKEN = 'NoteTaken',
}

export enum EventSource {
  BROWSER = 'browser',
  IDE = 'ide',
  AI_CHAT = 'ai_chat',
  PDF = 'pdf',
  SEARCH = 'search',
  NOTES = 'notes',
  DESKTOP = 'desktop',
}
