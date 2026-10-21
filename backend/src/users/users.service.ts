import { Injectable } from '@nestjs/common';
import { ObjectId, WithId } from 'mongodb';
import { hash, compare } from 'bcryptjs';
import { Db } from 'mongodb';
import { User } from './user.entity';

const USERS_COLLECTION = 'users';

@Injectable()
export class UsersService {
  constructor(private readonly db: Db) {}

  private collection() {
    return this.db.collection<User>(USERS_COLLECTION);
  }

  async findByEmail(email: string): Promise<WithId<User> | null> {
    return this.collection().findOne({ email });
  }

  async findById(id: string): Promise<WithId<User> | null> {
    return this.collection().findOne({ _id: new ObjectId(id) });
  }

  async create(email: string, password: string): Promise<WithId<User>> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new Error('User already exists');
    }

    const passwordHash = await hash(password, 10);
    const now = new Date();

    const result = await this.collection().insertOne({
      email,
      passwordHash,
      refreshTokens: [],
      createdAt: now,
    });

    const user = await this.collection().findOne({ _id: result.insertedId });
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  async validatePassword(
    email: string,
    password: string,
  ): Promise<WithId<User> | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const valid = await compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async addRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.collection().updateOne(
      { _id: new ObjectId(userId) },
      {
        $push: {
          refreshTokens: { tokenHash, expiresAt },
        },
      },
    );
  }

  async removeRefreshToken(userId: string, tokenHash: string): Promise<void> {
    await this.collection().updateOne(
      { _id: new ObjectId(userId) },
      {
        $pull: {
          refreshTokens: { tokenHash },
        },
      },
    );
  }

  async clearRefreshTokens(userId: string): Promise<void> {
    await this.collection().updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: { refreshTokens: [] },
      },
    );
  }

  /** Finds the user a refresh token belongs to, if it is still valid. */
  async findUserByRefreshTokenHash(tokenHash: string): Promise<string | null> {
    const user = await this.collection().findOne({
      'refreshTokens.tokenHash': tokenHash,
      'refreshTokens.expiresAt': { $gt: new Date() },
    });
    return user ? user._id.toString() : null;
  }
}
