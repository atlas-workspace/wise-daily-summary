export interface AuthContext {
  token: string;
  tenantId: string;
  facilityId: string;
  username: string;
}

export interface SessionData extends AuthContext {
  refreshToken: string;
  tokenExpiresAt: number;
  createdAt: number;
}
