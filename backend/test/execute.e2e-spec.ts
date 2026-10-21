import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { spawnSync } from 'child_process';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

process.env.MONGODB_URI =
  process.env.MONGODB_TEST_URI ?? 'mongodb://localhost:27017/swafcode_test';

interface RunResponse {
  output: string;
  error: string;
  exitCode: number | null;
  durationMs: number;
  compileMs: number;
  timedOut: boolean;
  kind: string;
}

interface LanguageResponse {
  id: string;
  name: string;
  runtime: string;
  filename: string;
  available: boolean;
  formatter: boolean;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const hasPython = spawnSync('sh', ['-c', 'command -v python3']).status === 0;
const itPython = hasPython ? it : it.skip;

describe('Execute (e2e)', () => {
  let app: INestApplication<App>;
  let tokens: Tokens;
  let email: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    email = `e2e-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'hunter2secret' })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'hunter2secret' })
      .expect(201);
    tokens = login.body as Tokens;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${tokens.accessToken}` });

  it('lists the supported languages', () => {
    return request(app.getHttpServer())
      .get('/execute/languages')
      .expect(200)
      .expect((res) => {
        const languages = res.body as LanguageResponse[];
        expect(languages).toHaveLength(6);
        expect(languages[0].id).toBe('typescript');
        expect(typeof languages[0].available).toBe('boolean');
        expect(typeof languages[0].formatter).toBe('boolean');
      });
  });

  it('refuses to run a program without a token', () => {
    return request(app.getHttpServer())
      .post('/execute')
      .send({ code: 'print(1)', language: 'python' })
      .expect(401);
  });

  it('refuses to run a program with a bad token', () => {
    return request(app.getHttpServer())
      .post('/execute')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ code: 'print(1)', language: 'python' })
      .expect(401);
  });

  it('rejects an unsupported language', () => {
    return request(app.getHttpServer())
      .post('/execute')
      .set(auth())
      .send({ code: 'print(1)', language: 'cobol' })
      .expect(400);
  });

  it('rejects an empty program', () => {
    return request(app.getHttpServer())
      .post('/execute')
      .set(auth())
      .send({ code: '', language: 'python' })
      .expect(400);
  });

  itPython('runs a program and reports the exit status', async () => {
    const res = await request(app.getHttpServer())
      .post('/execute')
      .set(auth())
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
      .set(auth())
      .send({ code: 'import sys; sys.exit(3)', language: 'python' });

    expect(res.status).toBe(201);
    const body = res.body as RunResponse;
    expect(body.exitCode).toBe(3);
    expect(body.kind).toBe('runtime');
  });

  itPython('streams the output of a program', async () => {
    const res = await request(app.getHttpServer())
      .post('/execute/stream')
      .set(auth())
      .send({
        code: 'import time\nprint("one", flush=True)\ntime.sleep(0.2)\nprint("two", flush=True)',
        language: 'python',
      });

    expect(res.status).toBe(200);
    const events = (res.text ?? '')
      .split('\n')
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            data?: string;
            result?: RunResponse;
          },
      );

    expect(events[0].type).toBe('out');
    expect(events.map((e) => e.data).join('')).toContain('one');
    expect(events.map((e) => e.data).join('')).toContain('two');

    const last = events[events.length - 1];
    expect(last.type).toBe('end');
    expect(last.result?.kind).toBe('ok');
  });

  itPython('writes to a running program', async () => {
    // .then() is what actually sends the request
    const running = request(app.getHttpServer())
      .post('/execute/stream')
      .set(auth())
      .send({
        code: 'print(input())',
        language: 'python',
        runId: 'e2e-stdin',
        interactive: true,
      })
      .then((res) => res);

    let written = false;
    for (let attempt = 0; attempt < 20 && !written; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const write = await request(app.getHttpServer())
        .post('/execute/e2e-stdin/stdin')
        .set(auth())
        .send({ data: 'hello\n' });
      written = (write.body as { written: boolean }).written;
    }

    expect(written).toBe(true);

    const res = await running;
    expect(res.text).toContain('hello');
  });

  it('reports an unknown run as not cancelled', () => {
    return request(app.getHttpServer())
      .delete('/execute/run-that-never-started')
      .set(auth())
      .expect(200)
      .expect({ cancelled: false });
  });

  it('formats a program', async () => {
    const res = await request(app.getHttpServer())
      .post('/format')
      .set(auth())
      .send({ code: 'const  x   =1', language: 'typescript' });

    expect(res.status).toBe(201);
    expect((res.body as { code: string }).code).toBe('const x = 1;\n');
  });

  it('refuses to format without a token', () => {
    return request(app.getHttpServer())
      .post('/format')
      .send({ code: 'const x = 1', language: 'typescript' })
      .expect(401);
  });

  it('rejects a format request for an unknown language', () => {
    return request(app.getHttpServer())
      .post('/format')
      .set(auth())
      .send({ code: 'x', language: 'cobol' })
      .expect(400);
  });
});
