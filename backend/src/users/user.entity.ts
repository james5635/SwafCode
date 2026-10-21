export type User = {
  email: string;
  passwordHash: string;
  refreshTokens: RefreshToken[];
  createdAt: Date;
};

export type RefreshToken = {
  tokenHash: string;
  expiresAt: Date;
};
