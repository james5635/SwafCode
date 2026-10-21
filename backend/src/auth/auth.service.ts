import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';

import { UsersService } from '../users/users.service';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface TokenPayload {
  sub: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('User already exists');
    }

    const user = await this.usersService.create(email, password);
    return { id: user._id.toString(), email: user.email };
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.usersService.validatePassword(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user._id.toString(), user.email);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const userId = await this.validateRefreshToken(refreshToken);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Rotate: remove the used refresh token
    const refreshTokenHash = this.hashToken(refreshToken);
    await this.usersService.removeRefreshToken(userId, refreshTokenHash);

    return this.issueTokens(user._id.toString(), user.email);
  }

  async logout(refreshToken: string, userId?: string): Promise<void> {
    const owner = await this.validateRefreshToken(refreshToken);
    if (!owner) return;
    if (userId && owner !== userId) return;
    const refreshTokenHash = this.hashToken(refreshToken);
    await this.usersService.removeRefreshToken(owner, refreshTokenHash);
  }

  private async issueTokens(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.signAccessToken({ sub: userId, email });
    const refreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.usersService.addRefreshToken(
      userId,
      refreshTokenHash,
      expiresAt,
    );

    return { accessToken, refreshToken };
  }

  private signAccessToken(payload: TokenPayload): string {
    return sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private async validateRefreshToken(
    refreshToken: string,
  ): Promise<string | null> {
    const tokenHash = this.hashToken(refreshToken);
    return this.usersService.findUserByRefreshTokenHash(tokenHash);
  }

  /**
   * A refresh token is looked up by its hash, so the hash has to come out the
   * same every time. A salted hash would never match, so this is a plain
   * digest over the token and the server secret.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(`${JWT_SECRET}:${token}`).digest('hex');
  }
}
