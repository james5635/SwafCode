import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { spawnSync } from 'child_process';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface RunResponse {
  output: string;
  error: string;
  exitCode: number | null;
  durationMs: number;
  compileMs: number;
  timedOut: boolean;
  kind: string;
}

const hasPython = spawnSync('sh', ['-c', 'command -v python3']).status === 0;
const itPython = hasPython ? it : it.skip;

describe('Execute (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the supported languages', () => {
    return request(app.getHttpServer())
      .get('/execute/languages')
      .expect(200)
      .expect((res) => {
        const languages = res.body as Array<{ id: string }>;
        expect(languages).toHaveLength(6);
        expect(languages[0].id).toBe('typescript');
      });
  });

  it('rejects an unsupported language', () => {
    return request(app.getHttpServer())
      .post('/execute')
      .send({ code: 'print(1)', language: 'cobol' })
      .expect(400);
  });

  it('rejects an empty program', () => {
    return request(app.getHttpServer())
      .post('/execute')
      .send({ code: '', language: 'python' })
      .expect(400);
  });

  itPython('runs a program and reports the exit status', async () => {
    const res = await request(app.getHttpServer())
      .post('/execute')
      .send({ code: 'print("hello")', language: 'python' });

    expect(res.status).toBe(201);
    const body = res.body as RunResponse;
    expect(body.output.trim()).toBe('hello');
    expect(body.exitCode).toBe(0);
    expect(body.kind).toBe('ok');
    expect(body.timedOut).toBe(false);
    expect(typeof body.durationMs).toBe('number');
  });

  itPython('reports a failing program as a runtime error', async () => {
    const res = await request(app.getHttpServer())
      .post('/execute')
      .send({ code: 'import sys; sys.exit(3)', language: 'python' });

    expect(res.status).toBe(201);
    const body = res.body as RunResponse;
    expect(body.exitCode).toBe(3);
    expect(body.kind).toBe('runtime');
  });

  it('reports an unknown run as not cancelled', () => {
    return request(app.getHttpServer())
      .delete('/execute/run-that-never-started')
      .expect(200)
      .expect({ cancelled: false });
  });
});
