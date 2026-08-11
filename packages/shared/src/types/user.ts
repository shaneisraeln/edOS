export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  STUDENT = 'student',
  FACULTY = 'faculty',
  ADMIN = 'admin',
}

export interface UserPreferences {
  userId: string;
  permissions: UserPermissions;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface UserPermissions {
  browser: boolean;
  ide: boolean;
  documents: boolean;
  aiPlatforms: boolean;
  notifications: boolean;
  screenContext: boolean;
}

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'createdAt' | 'updatedAt'>;
}
