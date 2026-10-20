import { Injectable } from '@nestjs/common';
import { spawn, spawnSync } from 'child_process';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

interface LanguageConfig {
  ext: string;
  filename?: string;
  compile?: (dir: string, filePath: string) => Promise<{ command: string; args: string[]; execPath: string }>;
  run: (dir: string, filePath: string, execPath?: string) => { command: string; args: string[] };
}

@Injectable()
export class CodeExecutionService {
  private readonly TIMEOUT_MS = 10_000;
  private readonly MAX_OUTPUT_BYTES = 1024 * 100;

  private readonly languages: Record<string, LanguageConfig> = {
    typescript: {
      ext: 'ts',
      run: (dir, filePath) => ({ command: 'tsx', args: [filePath] }),
    },
    python: {
      ext: 'py',
      run: (dir, filePath) => ({ command: 'python3', args: [filePath] }),
    },
    java: {
      ext: 'java',
      filename: 'Main.java',
      compile: async (dir, filePath) => {
        const result = spawnSync('javac', [filePath], { cwd: dir, timeout: this.TIMEOUT_MS });
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || 'Compilation failed');
        }
        return { command: 'java', args: ['-cp', dir, 'Main'], execPath: dir };
      },
      run: (dir) => ({ command: 'java', args: ['-cp', dir, 'Main'] }),
    },
    cpp: {
      ext: 'cpp',
      compile: async (dir, filePath) => {
        const execPath = join(dir, 'main');
        const result = spawnSync('g++', [filePath, '-o', execPath], { cwd: dir, timeout: this.TIMEOUT_MS });
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || 'Compilation failed');
        }
        return { command: execPath, args: [], execPath };
      },
      run: (dir, _filePath, execPath) => ({ command: execPath || join(dir, 'main'), args: [] }),
    },
    rust: {
      ext: 'rs',
      compile: async (dir, filePath) => {
        const execPath = join(dir, 'main');
        const result = spawnSync('rustc', [filePath, '-o', execPath], { cwd: dir, timeout: this.TIMEOUT_MS });
        if (result.status !== 0) {
          throw new Error(result.stderr?.toString() || 'Compilation failed');
        }
        return { command: execPath, args: [], execPath };
      },
      run: (dir, _filePath, execPath) => ({ command: execPath || join(dir, 'main'), args: [] }),
    },
    go: {
      ext: 'go',
      run: (dir, filePath) => ({ command: 'go', args: ['run', filePath] }),
    },
  };

  async execute(code: string, language: string) {
    const config = this.languages[language];
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const dir = await mkdtemp(join(tmpdir(), 'swafcode-'));
    const fileName = config.filename || `code.${config.ext}`;
    const filePath = join(dir, fileName);

    await writeFile(filePath, code, 'utf-8');

    let execCommand: string;
    let execArgs: string[];
    let execDir = dir;
    let execPath: string | undefined;

    try {
      if (config.compile) {
        const compileResult = await config.compile(dir, filePath);
        execCommand = compileResult.command;
        execArgs = compileResult.args;
        execPath = compileResult.execPath;
        execDir = dir;
      } else {
        const runConfig = config.run(dir, filePath, execPath);
        execCommand = runConfig.command;
        execArgs = runConfig.args;
        execDir = dir;
      }
    } catch (compileError) {
      await unlink(filePath).catch(() => {});
      return {
        output: '',
        error: compileError instanceof Error ? compileError.message : 'Compilation failed',
      };
    }

    return new Promise<{ output: string; error: string }>((resolve) => {
      const proc = spawn(execCommand, execArgs, {
        timeout: this.TIMEOUT_MS,
        cwd: execDir,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const kill = () => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // process already dead
        }
      };

      const timer = setTimeout(kill, this.TIMEOUT_MS);

      proc.on('close', () => {
        clearTimeout(timer);
        unlink(filePath).catch(() => {});

        if (stdout.length > this.MAX_OUTPUT_BYTES) {
          stdout = stdout.slice(0, this.MAX_OUTPUT_BYTES) + '\n... (output truncated)';
        }
        if (stderr.length > this.MAX_OUTPUT_BYTES) {
          stderr = stderr.slice(0, this.MAX_OUTPUT_BYTES) + '\n... (output truncated)';
        }

        resolve({
          output: stdout,
          error: stderr,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        unlink(filePath).catch(() => {});
        resolve({
          output: '',
          error: `Failed to start ${execCommand}: ${err.message}`,
        });
      });
    });
  }
}
