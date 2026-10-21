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

export interface ExecuteOptions {
  stdin?: string;
  runId?: string;
  interactive?: boolean;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface LanguageInfo {
  id: string;
  name: string;
  runtime: string;
  filename: string;
  available: boolean;
  formatter: boolean;
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

type FormatConfig = {
  command: string;
  args: string[];
  tools: string[];
};

interface LanguageConfig {
  id: string;
  name: string;
  runtime: string;
  ext: string;
  filename?: string;
  tools: string[];
  memory: MemoryCap;
  format?: FormatConfig;
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
  write: (data: string) => boolean;
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

/** Prettier ships as ESM, so it is run through its CLI instead of imported. */
function prettierBin(): string {
  return require.resolve('prettier/bin/prettier.cjs');
}

class CappedBuffer {
  private readonly decoder = new StringDecoder('utf8');
  private readonly parts: string[] = [];
  private bytes = 0;
  truncated = false;

  push(chunk: Buffer, limit: number): string {
    const text = this.decoder.write(chunk);
    if (!text) return '';
    const room = limit - this.bytes;
    if (room <= 0) {
      this.truncated = true;
      return '';
    }
    const buf = Buffer.from(text, 'utf8');
    if (buf.length > room) {
      const kept = buf.subarray(0, room).toString('utf8');
      this.parts.push(kept);
      this.bytes = limit;
      this.truncated = true;
      return kept;
    }
    this.parts.push(text);
    this.bytes += buf.length;
    return text;
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

  /** Runs waiting to be killed or written to, so the client can steer them. */
  private readonly active = new Map<string, ActiveRun>();

  private readonly languages: Record<string, LanguageConfig> = {
    typescript: {
      id: 'typescript',
      name: 'TypeScript',
      runtime: 'tsx',
      ext: 'ts',
      tools: ['tsx'],
      memory: { kind: 'node', mb: MEMORY_LIMIT_MB },
      format: {
        command: process.execPath,
        args: [prettierBin(), '--stdin-filepath=code.ts'],
        tools: [],
      },
      run: (_dir, filePath) => ({ command: 'tsx', args: [filePath] }),
    },
    python: {
      id: 'python',
      name: 'Python',
      runtime: 'python3',
      ext: 'py',
      tools: ['python3'],
      memory: { kind: 'rlimit', mb: MEMORY_LIMIT_MB },
      format: {
        command: 'black',
        args: ['-q', '-'],
        tools: ['black'],
      },
      run: (_dir, filePath) => ({ command: 'python3', args: [filePath] }),
    },
    java: {
      id: 'java',
      name: 'Java',
      runtime: 'openjdk',
      ext: 'java',
      filename: 'Main.java',
      tools: ['javac', 'java'],
      memory: { kind: 'jvm', mb: MEMORY_LIMIT_MB },
      format: {
        command: 'clang-format',
        args: ['--style=Google', '--assume-filename=Main.java'],
        tools: ['clang-format'],
      },
      compile: (dir, filePath) => ({
        command: 'javac',
        args: [filePath],
        execPath: dir,
      }),
      run: (dir) => ({ command: 'java', args: ['-cp', dir, 'Main'] }),
    },
    cpp: {
      id: 'cpp',
      name: 'C++',
      runtime: 'g++',
      ext: 'cpp',
      tools: ['g++'],
      memory: { kind: 'rlimit', mb: MEMORY_LIMIT_MB },
      format: {
        command: 'clang-format',
        args: ['--assume-filename=main.cpp'],
        tools: ['clang-format'],
      },
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
      id: 'rust',
      name: 'Rust',
      runtime: 'rustc',
      ext: 'rs',
      tools: ['rustc'],
      memory: { kind: 'rlimit', mb: MEMORY_LIMIT_MB },
      format: {
        command: 'rustfmt',
        args: ['--emit', 'stdout', '--edition', '2015'],
        tools: ['rustfmt'],
      },
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
      id: 'go',
      name: 'Go',
      runtime: 'go',
      ext: 'go',
      tools: ['go'],
      memory: { kind: 'go', mb: MEMORY_LIMIT_MB },
      format: { command: 'gofmt', args: [], tools: ['gofmt'] },
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

  /** True when the server knows this language. */
  isSupported(language: string): boolean {
    return Boolean(
      Object.prototype.hasOwnProperty.call(this.languages, language),
    );
  }

  /** The languages the server can offer, with the ones that are installed. */
  async listLanguages(): Promise<LanguageInfo[]> {
    const ids = Object.keys(this.languages);
    const availability = await Promise.all(
      ids.map((id) => this.areAvailable(this.languages[id].tools)),
    );
    const formatters = await Promise.all(
      ids.map((id) => {
        const format = this.languages[id].format;
        return format
          ? this.areAvailable(format.tools)
          : Promise.resolve(false);
      }),
    );

    return ids.map((id, index) => {
      const config = this.languages[id];
      return {
        id: config.id,
        name: config.name,
        runtime: config.runtime,
        filename: config.filename ?? `code.${config.ext}`,
        available: availability[index],
        formatter: formatters[index],
      };
    });
  }

  async execute(
    code: string,
    language: string,
    options: ExecuteOptions = {},
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
          runId: options.runId,
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
        stdin: options.stdin,
        interactive: options.interactive,
        runId: options.runId,
        onStdout: options.onStdout,
        onStderr: options.onStderr,
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

  /** Sends text to a running program. Returns false when it is gone. */
  write(runId: string, data: string): boolean {
    const run = this.active.get(runId);
    if (!run) return false;
    return run.write(data);
  }

  /** Formats a program the way its language expects. */
  async format(code: string, language: string): Promise<string> {
    const config = this.languages[language];
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }
    const format = config.format;
    if (!format) {
      throw new Error(`No formatter for ${config.name}`);
    }
    if (!(await this.areAvailable(format.tools))) {
      throw new Error(`No formatter installed for ${config.name}`);
    }

    const outcome = await this.spawnProcess(
      { command: format.command, args: format.args },
      { cwd: tmpdir(), timeoutMs: this.COMPILE_TIMEOUT_MS, stdin: code },
    );

    if (outcome.spawnError) {
      throw new Error(
        `Failed to start ${format.command}: ${outcome.spawnError.message}`,
      );
    }
    if (outcome.timedOut) {
      throw new Error(`${format.command} timed out`);
    }
    if (outcome.exitCode !== 0) {
      throw new Error(outcome.stderr.trim() || `${format.command} failed`);
    }

    return outcome.stdout;
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

  private async areAvailable(tools: string[]): Promise<boolean> {
    if (tools.length === 0) return true;
    const checks = await Promise.all(
      tools.map((tool) => this.isAvailable(tool)),
    );
    return checks.every(Boolean);
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

  private spawnProcess(
    spec: RunSpec,
    options: {
      cwd: string;
      timeoutMs: number;
      stdin?: string;
      interactive?: boolean;
      runId?: string;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
  ): Promise<ProcessOutcome> {
    return new Promise((resolve) => {
      const stdout = new CappedBuffer();
      const stderr = new CappedBuffer();
      let timedOut = false;
      let settled = false;

      const active: ActiveRun = {
        cancelled: false,
        kill: () => {},
        write: () => false,
      };

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

      active.write = (data: string) => {
        const stream = proc.stdin;
        if (!stream || stream.destroyed || stream.writableEnded) return false;
        try {
          stream.write(data);
          return true;
        } catch {
          return false;
        }
      };

      if (options.runId) {
        this.active.set(options.runId, active);
      }

      const timer = setTimeout(() => {
        timedOut = true;
        active.kill();
      }, options.timeoutMs);

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = stdout.push(chunk, this.MAX_OUTPUT_BYTES);
        if (text) options.onStdout?.(text);
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = stderr.push(chunk, this.MAX_OUTPUT_BYTES);
        if (text) options.onStderr?.(text);
      });

      proc.stdin?.on('error', () => {
        // the program closed its input, or it is already gone
      });

      if (options.interactive) {
        // the client writes to this pipe while the program runs
      } else if (options.stdin) {
        proc.stdin?.write(options.stdin);
        proc.stdin?.end();
      } else {
        proc.stdin?.end();
      }

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
