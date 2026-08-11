const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface FetchOptions extends RequestInit {
  token?: string;
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

  // Learning Sessions
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
