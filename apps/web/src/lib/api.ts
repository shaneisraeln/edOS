const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface FetchOptions extends RequestInit {
  token?: string;
}

/** A surface taking part in a session. */
export interface SessionParticipant {
  surface: string;
  label: string;
  status: 'live' | 'idle' | 'left' | string;
  deviceName?: string | null;
  joinedAt: string;
  lastSeenAt: string;
  eventCount: number;
}

/** A surface that cannot capture until a permission is granted. */
export interface BlockedSurface {
  surface: string;
  label: string;
  permission: string;
}

/** A knowledge check the server has assigned to this surface to present. */
export interface SessionCheck {
  id: string;
  question: string;
  type: string;
  surface: string;
  sessionId: string;
  topic: string;
  /** Seconds until the next check is due. */
  nextInSeconds: number;
}

/** The outcome of answering a check. `correct: null` means it was not graded. */
export interface CheckResult {
  correct: boolean | null;
  feedback: string;
  score: number | null;
  maxScore: number;
  degraded: boolean;
}

/** A session that finished, described for a surface still attached to it. */
export interface EndedSessionSummary {
  id: string;
  topic: string;
  elapsedSeconds: number;
  checkCount: number;
  reason: string;
  /** A short quiz generated at session-end, if the server could make one. */
  quiz: { id: string; questions: { id: string; text: string; type: string }[]; topic: string } | null;
}

/** The learner's single session, spanning every surface. */
export interface SessionView {
  id: string;
  topic: string;
  subtopic?: string | null;
  status: 'active' | 'paused' | 'completed' | 'abandoned' | string;
  mode: 'solo' | 'multi' | string;
  initiatedBy: string;
  startedAt: string;
  endedAt?: string | null;
  pausedAt?: string | null;
  elapsedSeconds: number;
  participants: SessionParticipant[];
  eligibleSurfaces: string[];
  awaitingSurfaces: string[];
  blockedSurfaces: BlockedSurface[];
  /** Seconds between knowledge checks, decided by the server. */
  checkIntervalSeconds: number;
  /** Seconds until the next check, or null when none is scheduled. */
  nextCheckInSeconds: number | null;
  checkCount: number;
}

/** A human-readable name for this browser, for the devices list. */
function browserLabel(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';
  const os = /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${name} on ${os}` : name;
}

class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  async request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const { token, ...fetchOptions } = options;
    const accessToken = token || this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async register(name: string, email: string, password: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getProfile() {
    return this.request<any>('/auth/profile');
  }

  // --- Unified cross-surface session ---------------------------------------
  // One session spans web, desktop, browser and IDE. These endpoints replace
  // the old /learning/start + /learning/end pair, which had no idea other
  // surfaces existed and minted a separate session per client.

  /**
   * Start a session, or join the one already running.
   *
   * Idempotent on the server: if an agent already started a session, this
   * attaches the web surface to it instead of creating a second one.
   */
  async startUnifiedSession(topic: string, subtopic?: string) {
    return this.request<{ session: SessionView; created: boolean }>('/session/start', {
      method: 'POST',
      body: JSON.stringify({ topic, subtopic, surface: 'web', deviceName: browserLabel() }),
    });
  }

  /** The running session, or null. */
  async getActiveSession() {
    return this.request<{ session: SessionView | null }>('/session/active');
  }

  /** Attach this browser to a session started elsewhere. */
  async joinSession() {
    return this.request<{ session: SessionView | null }>('/session/join', {
      method: 'POST',
      body: JSON.stringify({ surface: 'web', deviceName: browserLabel() }),
    });
  }

  /** Report liveness so this surface shows as live rather than idle. */
  async sessionHeartbeat() {
    return this.request<{ session: SessionView | null }>('/session/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ surface: 'web' }),
    });
  }

  /**
   * One tick: stay joined, and collect anything the server has due.
   *
   * Replaces the separate active/join/heartbeat calls, and is how the page
   * learns that a knowledge check is due or that the session ended elsewhere.
   */
  async sessionPulse(knownSessionId?: string) {
    return this.request<{
      session: SessionView | null;
      check: SessionCheck | null;
      endedSession: EndedSessionSummary | null;
      pulseIntervalSeconds: number;
    }>('/session/pulse', {
      method: 'POST',
      body: JSON.stringify({
        surface: 'web',
        deviceName: browserLabel(),
        ...(knownSessionId ? { knownSessionId } : {}),
      }),
    });
  }

  /** Answer a knowledge check. Graded against the exact question issued. */
  async answerCheck(checkId: string, answer: string, sessionId?: string) {
    return this.request<CheckResult>('/session/check/answer', {
      method: 'POST',
      body: JSON.stringify({ checkId, answer, sessionId }),
    });
  }

  /** Dismiss a knowledge check without answering. */
  async skipCheck(checkId: string, sessionId?: string) {
    return this.request<{ ok: boolean }>('/session/check/skip', {
      method: 'POST',
      body: JSON.stringify({ checkId, sessionId }),
    });
  }

  /** Pause capture on every surface at once. */
  async pauseSession() {
    return this.request<{ session: SessionView }>('/session/pause', {
      method: 'POST',
      body: '{}',
    });
  }

  async resumeSession() {
    return this.request<{ session: SessionView }>('/session/resume', {
      method: 'POST',
      body: '{}',
    });
  }

  /** End the session for every surface, not just this tab. */
  async endUnifiedSession(confidence?: number) {
    return this.request<{
      session: SessionView;
      quiz: { id: string; questions: { id: string; text: string; type: string }[]; topic: string } | null;
    }>('/session/end', {
      method: 'POST',
      body: JSON.stringify(confidence === undefined ? {} : { confidence }),
    });
  }

  // Legacy single-surface endpoints. Kept because older builds of the agents
  // still call them; the server now forwards both to the unified session.
  async startSession(topic: string, subtopic?: string) {
    return this.request<any>('/learning/start', {
      method: 'POST',
      body: JSON.stringify({ topic, subtopic }),
    });
  }

  async endSession(sessionId: string, confidence?: number) {
    return this.request<any>('/learning/end', {
      method: 'POST',
      body: JSON.stringify({ sessionId, confidence }),
    });
  }

  async getSessionHistory(limit?: number) {
    return this.request<any[]>(`/learning/history${limit ? `?limit=${limit}` : ''}`);
  }

  // Knowledge Graph
  async getGraph() {
    return this.request<any>('/graph');
  }

  async getConcepts() {
    return this.request<any[]>('/graph/concepts');
  }

  async getWeakConcepts(limit?: number) {
    return this.request<any[]>(`/graph/weak${limit ? `?limit=${limit}` : ''}`);
  }

  async getStrongConcepts(limit?: number) {
    return this.request<any[]>(`/graph/strong${limit ? `?limit=${limit}` : ''}`);
  }

  // Assessments
  async generateAssessment(topic: string, options?: { subtopic?: string; difficulty?: string; type?: string; questionCount?: number }) {
    return this.request<any>('/assessment/generate', {
      method: 'POST',
      body: JSON.stringify({ topic, ...options }),
    });
  }

  async submitAssessment(assessmentId: string, answers: { questionId: string; answer: string }[]) {
    return this.request<any>('/assessment/submit', {
      method: 'POST',
      body: JSON.stringify({ assessmentId, answers }),
    });
  }

  async getAssessmentHistory(limit?: number) {
    return this.request<any[]>(`/assessment/history${limit ? `?limit=${limit}` : ''}`);
  }

  // User Goals
  async setGoal(curriculumId: string, curriculumName: string, skillLevel: string, targetDate?: string) {
    return this.request<any>('/user/goals', {
      method: 'POST',
      body: JSON.stringify({ curriculumId, curriculumName, skillLevel, targetDate }),
    });
  }

  async getGoals() {
    return this.request<any[]>('/user/goals');
  }

  // Dashboard
  async getDashboard() {
    return this.request<any>('/dashboard');
  }

  async getProgress() {
    return this.request<any>('/dashboard/progress');
  }
}

export const api = new APIClient(API_BASE);
