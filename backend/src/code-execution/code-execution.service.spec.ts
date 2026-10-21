import { spawnSync } from 'child_process';
import { existsSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodeExecutionService } from './code-execution.service';

interface RunSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface LanguageEntry {
  memory: { kind: string; mb: number };
  run: (dir: string, filePath: string, execPath?: string) => RunSpec;
}

interface ServiceInternals {
  languages: Record<string, LanguageEntry>;
  withMemoryCap: (config: LanguageEntry, spec: RunSpec) => RunSpec;
}

function hasCommand(command: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${command}`]).status === 0;
}

const hasPython = hasCommand('python3');
const hasJava = hasCommand('javac');

const itPython = hasPython ? it : it.skip;
const itJava = hasJava ? it : it.skip;

function tempDirs(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith('swafcode-'));
}

describe('CodeExecutionService', () => {
  let service: CodeExecutionService;
  let internals: ServiceInternals;

  beforeEach(() => {
    process.env.SWAFCODE_RUN_TIMEOUT_MS = '600';
    service = new CodeExecutionService();
    internals = service as unknown as ServiceInternals;
  });

  afterEach(() => {
    delete process.env.SWAFCODE_RUN_TIMEOUT_MS;
  });

  itPython('captures stdout and reports a clean exit', async () => {
    const result = await service.execute('print("hello")', 'python');

    expect(result.output.trim()).toBe('hello');
    expect(result.error).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.kind).toBe('ok');
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  itPython('reports a failing program as a runtime error', async () => {
    const result = await service.execute('raise ValueError("boom")', 'python');

    expect(result.exitCode).not.toBe(0);
    expect(result.kind).toBe('runtime');
    expect(result.error).toContain('boom');
  });

  itPython('feeds standard input to the program', async () => {
    const result = await service.execute(
      'print(input())',
      'python',
      'from stdin\n',
    );

    expect(result.output.trim()).toBe('from stdin');
    expect(result.kind).toBe('ok');
  });

  itPython('kills a program that runs past the timeout', async () => {
    const result = await service.execute('while True: pass', 'python');

    expect(result.kind).toBe('timeout');
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(500);
  });

  itPython('kills the whole process group when the timeout hits', async () => {
    const marker = join(tmpdir(), `swafcode-marker-${Date.now()}`);
    const code = [
      'import subprocess, sys',
      `subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(1); open(${JSON.stringify(marker)}, "w").write("x")'])`,
      'while True: pass',
    ].join('\n');

    await service.execute(code, 'python');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(existsSync(marker)).toBe(false);
    rmSync(marker, { force: true });
  });

  itPython('cancels a running program', async () => {
    const running = service.execute(
      'while True: pass',
      'python',
      undefined,
      'run-under-test',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(service.cancel('run-under-test')).toBe(true);

    const result = await running;
    expect(result.kind).toBe('cancelled');
    expect(result.timedOut).toBe(false);
  });

  it('reports an unknown run as not cancelled', () => {
    expect(service.cancel('run-that-never-started')).toBe(false);
  });

  itPython('removes the temporary directory when the run ends', async () => {
    const before = tempDirs();

    await service.execute('print("hello")', 'python');
    await service.execute('while True: pass', 'python');

    expect(tempDirs()).toEqual(before);
  });

  itPython('truncates output past the limit', async () => {
    const result = await service.execute('print("x" * 200000)', 'python');

    expect(result.output.length).toBeLessThan(200000);
    expect(result.output).toContain('output truncated');
  });

  itJava('reports a compile error as a compile error', async () => {
    const result = await service.execute('public class Main { oops }', 'java');

    expect(result.kind).toBe('compile');
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toContain('error');
    expect(result.output).toBe('');
  });

  itJava('compiles and runs a program', async () => {
    const result = await service.execute(
      'public class Main { public static void main(String[] a) { System.out.println("hello"); } }',
      'java',
    );

    expect(result.kind).toBe('ok');
    expect(result.output.trim()).toBe('hello');
    expect(result.compileMs).toBeGreaterThan(0);
  });

  it('reports a runtime that cannot start as a spawn error', async () => {
    const original = internals.languages.python.run;
    internals.languages.python.run = () => ({
      command: 'swafcode-missing-runtime',
      args: [],
    });

    const result = await service.execute('print("hello")', 'python');

    internals.languages.python.run = original;
    expect(result.kind).toBe('spawn');
    expect(result.error).toContain('Failed to start');
  });

  it('caps the memory of a program', () => {
    const node = internals.withMemoryCap(internals.languages.typescript, {
      command: 'tsx',
      args: ['code.ts'],
    });
    expect(node.env?.NODE_OPTIONS).toContain('--max-old-space-size=');

    const jvm = internals.withMemoryCap(internals.languages.java, {
      command: 'java',
      args: ['-cp', '.', 'Main'],
    });
    expect(jvm.args[0]).toMatch(/^-Xmx\d+m$/);

    const go = internals.withMemoryCap(internals.languages.go, {
      command: 'main',
      args: [],
    });
    expect(go.env?.GOMEMLIMIT).toMatch(/^\d+MiB$/);

    const limited = internals.withMemoryCap(internals.languages.python, {
      command: 'python3',
      args: ['code.py'],
    });
    expect(limited.command).toBe('sh');
    expect(limited.args[1]).toContain('ulimit -v');
    expect(limited.args[2]).toBe('python3');
    expect(limited.args[3]).toBe('code.py');
  });
});
