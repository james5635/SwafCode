import { Injectable } from '@nestjs/common';
import { spawn, spawnSync } from 'child_process';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

@Injectable()
export class CodeExecutionService {
  private readonly TIMEOUT_MS = 10_000;
  private readonly MAX_OUTPUT_BYTES = 1024 * 100;

  async execute(code: string, language: 'python' | 'javascript') {
    const dir = await mkdtemp(join(tmpdir(), 'swafcode-'));
    const ext = language === 'python' ? 'py' : 'js';
    const filePath = join(dir, `code.${ext}`);

    await writeFile(filePath, code, 'utf-8');

    const command = language === 'python' ? 'python3' : 'node';
    const args = language === 'python' ? [filePath] : [filePath];

    return new Promise<{ output: string; error: string }>((resolve) => {
      const proc = spawn(command, args, {
        timeout: this.TIMEOUT_MS,
        cwd: dir,
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
          stdout =
            stdout.slice(0, this.MAX_OUTPUT_BYTES) + '\n... (output truncated)';
        }
        if (stderr.length > this.MAX_OUTPUT_BYTES) {
          stderr =
            stderr.slice(0, this.MAX_OUTPUT_BYTES) + '\n... (output truncated)';
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
          error: `Failed to start ${command}: ${err.message}`,
        });
      });
    });
  }
}
