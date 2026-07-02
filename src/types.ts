export interface AuthContext {
  token: string;
  tenantId: string;
  facilityId: string;
  username: string;
}

export interface SessionData extends AuthContext {
  createdAt: number;
}
