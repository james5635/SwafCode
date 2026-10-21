import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { hashSync, compareSync } from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

interface FakeUser {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  refreshTokens: { tokenHash: string; expiresAt: Date }[];
}

class FakeUsersService {
  readonly users: FakeUser[] = [];

  findByEmail(email: string): Promise<FakeUser | null> {
    return Promise.resolve(this.users.find((u) => u.email === email) ?? null);
  }

  findById(id: string): Promise<FakeUser | null> {
    return Promise.resolve(
      this.users.find((u) => u._id.toString() === id) ?? null,
    );
  }

  create(email: string, password: string): Promise<FakeUser> {
    const user: FakeUser = {
      _id: new ObjectId(),
      email,
      passwordHash: hashSync(password, 4),
      refreshTokens: [],
    };
    this.users.push(user);
    return Promise.resolve(user);
  }

  async validatePassword(
    email: string,
    password: string,
  ): Promise<FakeUser | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;
    return compareSync(password, user.passwordHash) ? user : null;
  }

  async addRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const user = await this.findById(userId);
    user?.refreshTokens.push({ tokenHash, expiresAt });
  }

  async removeRefreshToken(userId: string, tokenHash: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) return;
    user.refreshTokens = user.refreshTokens.filter(
      (t) => t.tokenHash !== tokenHash,
    );
  }

  findUserByRefreshTokenHash(tokenHash: string): Promise<string | null> {
    const user = this.users.find((u) =>
      u.refreshTokens.some(
        (t) => t.tokenHash === tokenHash && t.expiresAt > new Date(),
      ),
    );
    return Promise.resolve(user?._id.toString() ?? null);
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let users: FakeUsersService;

  beforeEach(() => {
    users = new FakeUsersService();
    service = new AuthService(users as unknown as UsersService);
  });

  it('registers a user', async () => {
    const user = await service.register('jame@example.com', 'hunter2secret');

    expect(user.email).toBe('jame@example.com');
    expect(user.id).toBeTruthy();
    expect(users.users).toHaveLength(1);
  });

  it('refuses to register the same email twice', async () => {
    await service.register('jame@example.com', 'hunter2secret');

    await expect(
      service.register('jame@example.com', 'hunter2secret'),
    ).rejects.toThrow(ConflictException);
  });

  it('signs in with the right password', async () => {
    await service.register('jame@example.com', 'hunter2secret');

    const tokens = await service.login('jame@example.com', 'hunter2secret');

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
  });

  it('refuses a wrong password', async () => {
    await service.register('jame@example.com', 'hunter2secret');

    await expect(service.login('jame@example.com', 'wrong')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses an unknown email', async () => {
    await expect(
      service.login('nobody@example.com', 'hunter2secret'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('stores the refresh token hashed, never in the clear', async () => {
    await service.register('jame@example.com', 'hunter2secret');
    const tokens = await service.login('jame@example.com', 'hunter2secret');

    const stored = users.users[0].refreshTokens[0].tokenHash;
    expect(stored).not.toBe(tokens.refreshToken);
    expect(stored).toHaveLength(64);
  });

  it('refreshes with a valid refresh token', async () => {
    await service.register('jame@example.com', 'hunter2secret');
    const first = await service.login('jame@example.com', 'hunter2secret');

    const second = await service.refresh(first.refreshToken);

    expect(second.accessToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });

  it('rotates: a refresh token works only once', async () => {
    await service.register('jame@example.com', 'hunter2secret');
    const first = await service.login('jame@example.com', 'hunter2secret');

    await service.refresh(first.refreshToken);

    await expect(service.refresh(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a refresh token that was never issued', async () => {
    await expect(service.refresh('made-up-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('signs out', async () => {
    await service.register('jame@example.com', 'hunter2secret');
    const tokens = await service.login('jame@example.com', 'hunter2secret');

    await service.logout(tokens.refreshToken);

    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not sign out somebody else', async () => {
    await service.register('jame@example.com', 'hunter2secret');
    const tokens = await service.login('jame@example.com', 'hunter2secret');

    await service.logout(tokens.refreshToken, 'somebody-else');

    await expect(service.refresh(tokens.refreshToken)).resolves.toBeTruthy();
  });
});
