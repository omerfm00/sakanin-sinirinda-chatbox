export type UserRole = 'student' | 'teacher' | 'admin';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  tutorialCompleted: boolean;
}

export interface AuthRequest {
  headers: {
    cookie?: string;
  };
  query: Record<string, unknown>;
  user: AuthenticatedUser;
}
