import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

export interface TokenPayload {
  sub: string;
  email: string;
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
