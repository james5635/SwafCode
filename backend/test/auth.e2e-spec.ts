import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

process.env.MONGODB_URI =
  process.env.MONGODB_TEST_URI ?? 'mongodb://localhost:27017/swafcode_test';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let email: string;
  let password: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    email = `auth-e2e-${Date.now()}@example.com`;
    password = 'hunter2secret';
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201)
      .expect((res) => {
        const body = res.body as { email: string; passwordHash?: string };
        expect(body.email).toBe(email);
        expect(body.passwordHash).toBeUndefined();
      });
  });

  it('refuses the same email twice', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(409);
  });

  it('refuses a registration without a password', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `other-${Date.now()}@example.com` })
      .expect(400);
  });

  it('signs in and returns a pair of tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const tokens = res.body as Tokens;
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('refuses a wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong' })
      .expect(401);
  });

  it('tells who the token belongs to', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    const tokens = login.body as Tokens;

    const res = await request(app.getHttpServer())
      .post('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(201);

    expect((res.body as { email: string }).email).toBe(email);
  });

  it('refuses /me without a token', () => {
    return request(app.getHttpServer()).post('/auth/me').expect(401);
  });

  it('refreshes a token and retires the old one', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    const tokens = login.body as Tokens;

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(201);

    const next = refreshed.body as Tokens;
    expect(next.accessToken).toBeTruthy();
    expect(next.refreshToken).not.toBe(tokens.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('signs out and kills the refresh token', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    const tokens = login.body as Tokens;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('refuses a refresh token that was never issued', () => {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'made-up' })
      .expect(401);
  });
});
