import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { writeFile, rm, mkdtemp } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type RunKind =
  'ok' | 'compile' | 'runtime' | 'spawn' | 'timeout' | 'cancelled';

export interface RunResult {
  output: string;
  error: string;
  exitCode: number | null;
  durationMs: number;
  compileMs: number;
  timedOut: boolean;
  kind: RunKind;
}

interface RunSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

type MemoryCapKind = 'node' | 'jvm' | 'go' | 'rlimit';

interface MemoryCap {
  kind: MemoryCapKind;
  mb: number;
}

interface LanguageConfig {
  ext: string;
  filename?: string;
  memory: MemoryCap;
  compile?: (
    dir: string,
    filePath: string,
  ) => {
    command: string;
    args: string[];
    execPath?: string;
  };
  run: (dir: string, filePath: string, execPath?: string) => RunSpec;
}

interface ActiveRun {
  cancelled: boolean;
  kill: () => void;
}

interface ProcessOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  spawnError: Error | null;
  truncated: boolean;
}

const MEMORY_LIMIT_MB = 256;

function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

class CappedBuffer {
  private readonly decoder = new StringDecoder('utf8');
  private readonly parts: string[] = [];
  private bytes = 0;
  truncated = false;

  push(chunk: Buffer, limit: number): void {
    const text = this.decoder.write(chunk);
    if (!text) return;
    const room = limit - this.bytes;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    const buf = Buffer.from(text, 'utf8');
    if (buf.length > room) {
      this.parts.push(buf.subarray(0, room).toString('utf8'));
      this.bytes = limit;
      this.truncated = true;
      return;
    }
    this.parts.push(text);
    this.bytes += buf.length;
  }

  finish(): string {
    const tail = this.decoder.end();
    if (tail) this.parts.push(tail);
    return this.parts.join('');
  }
}

@Injectable()
export class CodeExecutionService {
  private readonly RUN_TIMEOUT_MS = envMs('SWAFCODE_RUN_TIMEOUT_MS', 10_000);
  private readonly COMPILE_TIMEOUT_MS = envMs(
    'SWAFCODE_COMPILE_TIMEOUT_MS',
    45_000,
  );
  private readonly MAX_OUTPUT_BYTES = 1024 * 100;

  /** Runs waiting to be killed, so the client can stop them. */
  private readonly active = new Map<string, ActiveRun>();

  private readonly languages: Record<string, LanguageConfig> = {
    typescript: {
      ext: 'ts',
      memory: { kind: 'node', mb: MEMORY_LIMIT_MB },
      run: (_dir, filePath) => ({ command: 'tsx', args: [filePath] }),
    },
    python: {
      ext: 'py',
      memory: { kind: 'rlimit', mb: MEMORY_LIMIT_MB },
      run: (_dir, filePath) => ({ command: 'python3', args: [filePath] }),
    },
    java: {
      ext: 'java',
      filename: 'Main.java',
      memory: { kind: 'jvm', mb: MEMORY_LIMIT_MB },
      compile: (dir, filePath) => ({
        command: 'javac',
        args: [filePath],
        execPath: dir,
      }),
      run: (dir) => ({ command: 'java', args: ['-cp', dir, 'Main'] }),
    },
    cpp: {
      ext: 'cpp',
      memory: { kind: 'rlimit', mb: MEMORY_LIMIT_MB },
      compile: (dir, filePath) => {
        const execPath = join(dir, 'main');
        return { command: 'g++', args: [filePath, '-o', execPath], execPath };
      },
      run: (_dir, _filePath, execPath) => ({
        command: execPath ?? '',
        args: [],
      }),
    },
    rust: {
      ext: 'rs',
      memory: { kind: 'rlimit', mb: MEMORY_LIMIT_MB },
      compile: (dir, filePath) => {
        const execPath = join(dir, 'main');
        return { command: 'rustc', args: [filePath, '-o', execPath], execPath };
      },
      run: (_dir, _filePath, execPath) => ({
        command: execPath ?? '',
        args: [],
      }),
    },
    go: {
      ext: 'go',
      memory: { kind: 'go', mb: MEMORY_LIMIT_MB },
      compile: (dir, filePath) => {
        const execPath = join(dir, 'main');
        return {
          command: 'go',
          args: ['build', '-o', execPath, filePath],
          execPath,
        };
      },
      run: (_dir, _filePath, execPath) => ({
        command: execPath ?? '',
        args: [],
      }),
    },
  };

  async execute(
    code: string,
    language: string,
    stdin?: string,
    runId?: string,
  ): Promise<RunResult> {
    const config = this.languages[language];
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const dir = await mkdtemp(join(tmpdir(), 'swafcode-'));
    const filePath = join(dir, config.filename || `code.${config.ext}`);

    try {
      await writeFile(filePath, code, 'utf-8');

      let execPath: string | undefined;
      let compileMs = 0;

      if (config.compile) {
        const spec = config.compile(dir, filePath);
        if (!(await this.isAvailable(spec.command))) {
          return this.result(
            '',
            `Failed to start ${spec.command}: command not found`,
            null,
            0,
            0,
            false,
            'spawn',
          );
        }
        const compileStart = Date.now();
        const outcome = await this.spawnProcess(spec, {
          cwd: dir,
          timeoutMs: this.COMPILE_TIMEOUT_MS,
          runId,
        });
        compileMs = Date.now() - compileStart;

        if (outcome.cancelled) {
          return this.result('', '', null, 0, compileMs, false, 'cancelled');
        }
        if (outcome.spawnError) {
          return this.result(
            '',
            `Failed to start ${spec.command}: ${outcome.spawnError.message}`,
            null,
            0,
            compileMs,
            false,
            'spawn',
          );
        }
        if (outcome.timedOut) {
          return this.result(
            '',
            `Compilation timed out after ${Math.round(this.COMPILE_TIMEOUT_MS / 1000)}s`,
            null,
            0,
            compileMs,
            false,
            'compile',
          );
        }
        if (outcome.exitCode !== 0) {
          return this.result(
            '',
            outcome.stderr.trim() || 'Compilation failed',
            outcome.exitCode,
            0,
            compileMs,
            false,
            'compile',
          );
        }

        execPath = spec.execPath;
      }

      const program = config.run(dir, filePath, execPath);
      if (!(await this.isAvailable(program.command))) {
        return this.result(
          '',
          `Failed to start ${program.command}: command not found`,
          null,
          0,
          compileMs,
          false,
          'spawn',
        );
      }

      const spec = this.withMemoryCap(config, program);
      const runStart = Date.now();
      const outcome = await this.spawnProcess(spec, {
        cwd: dir,
        timeoutMs: this.RUN_TIMEOUT_MS,
        stdin,
        runId,
      });
      const durationMs = Date.now() - runStart;

      const output = outcome.truncated
        ? `${outcome.stdout}\n... (output truncated)`
        : outcome.stdout;
      const error = outcome.truncated
        ? `${outcome.stderr}\n... (output truncated)`
        : outcome.stderr;

      if (outcome.spawnError) {
        return this.result(
          '',
          `Failed to start ${spec.command}: ${outcome.spawnError.message}`,
          null,
          durationMs,
          compileMs,
          false,
          'spawn',
        );
      }
      if (outcome.cancelled) {
        return this.result(
          output,
          error,
          outcome.exitCode,
          durationMs,
          compileMs,
          false,
          'cancelled',
        );
      }
      if (outcome.timedOut) {
        return this.result(
          output,
          error || `Timed out after ${Math.round(this.RUN_TIMEOUT_MS / 1000)}s`,
          outcome.exitCode,
          durationMs,
          compileMs,
          true,
          'timeout',
        );
      }

      const failed = outcome.exitCode !== 0;
      return this.result(
        output,
        error,
        outcome.exitCode,
        durationMs,
        compileMs,
        false,
        failed ? 'runtime' : 'ok',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Kills a running program. Returns false when the run is already over. */
  cancel(runId: string): boolean {
    const run = this.active.get(runId);
    if (!run) return false;
    run.cancelled = true;
    run.kill();
    return true;
  }

  /** True when the command can be found on the server. */
  private isAvailable(command: string): Promise<boolean> {
    if (!command) return Promise.resolve(false);
    if (command.includes('/')) {
      return Promise.resolve(existsSync(command));
    }
    return new Promise((resolve) => {
      const probe = spawn('sh', ['-c', `command -v ${command}`]);
      probe.on('close', (code) => resolve(code === 0));
      probe.on('error', () => resolve(false));
    });
  }

  private result(
    output: string,
    error: string,
    exitCode: number | null,
    durationMs: number,
    compileMs: number,
    timedOut: boolean,
    kind: RunKind,
  ): RunResult {
    return { output, error, exitCode, durationMs, compileMs, timedOut, kind };
  }

  /**
   * Caps the memory a program can take. Node, the JVM and Go get their own
   * knob; everything else runs under an address-space limit.
   */
  private withMemoryCap(config: LanguageConfig, spec: RunSpec): RunSpec {
    const cap = config.memory;
    switch (cap.kind) {
      case 'node':
        return {
          ...spec,
          env: {
            ...spec.env,
            NODE_OPTIONS: [
              process.env.NODE_OPTIONS,
              `--max-old-space-size=${cap.mb}`,
            ]
              .filter(Boolean)
              .join(' '),
          },
        };
      case 'jvm':
        return { ...spec, args: [`-Xmx${cap.mb}m`, ...spec.args] };
      case 'go':
        return { ...spec, env: { ...spec.env, GOMEMLIMIT: `${cap.mb}MiB` } };
      case 'rlimit':
        return {
          command: 'sh',
          args: [
            '-c',
            `ulimit -v ${cap.mb * 1024}; exec "$0" "$@"`,
            spec.command,
            ...spec.args,
          ],
        };
    }
  }

  private spawnProcess(
    spec: RunSpec,
    options: {
      cwd: string;
      timeoutMs: number;
      stdin?: string;
      runId?: string;
    },
  ): Promise<ProcessOutcome> {
    return new Promise((resolve) => {
      const stdout = new CappedBuffer();
      const stderr = new CappedBuffer();
      let timedOut = false;
      let settled = false;

      const active: ActiveRun = { cancelled: false, kill: () => {} };

      const proc = spawn(spec.command, spec.args, {
        cwd: options.cwd,
        env: { ...process.env, ...spec.env },
        detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const pid = proc.pid;
      active.kill = () => {
        if (pid === undefined) {
          try {
            proc.kill('SIGKILL');
          } catch {
            // already gone
          }
          return;
        }
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try {
            proc.kill('SIGKILL');
          } catch {
            // already gone
          }
        }
      };

      if (options.runId) {
        this.active.set(options.runId, active);
      }

      const timer = setTimeout(() => {
        timedOut = true;
        active.kill();
      }, options.timeoutMs);

      proc.stdout?.on('data', (chunk: Buffer) =>
        stdout.push(chunk, this.MAX_OUTPUT_BYTES),
      );
      proc.stderr?.on('data', (chunk: Buffer) =>
        stderr.push(chunk, this.MAX_OUTPUT_BYTES),
      );

      if (options.stdin && proc.stdin) {
        proc.stdin.write(options.stdin);
      }
      proc.stdin?.end();

      const finish = (exitCode: number | null, spawnError: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (options.runId) this.active.delete(options.runId);
        resolve({
          exitCode,
          stdout: stdout.finish(),
          stderr: stderr.finish(),
          timedOut,
          cancelled: active.cancelled,
          spawnError,
          truncated: stdout.truncated || stderr.truncated,
        });
      };

      proc.on('error', (err) => finish(null, err));
      proc.on('close', (code) => finish(code, null));
    });
  }
}
