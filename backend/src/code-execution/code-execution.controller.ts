import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CodeExecutionService,
  LanguageInfo,
  RunResult,
} from './code-execution.service';
import { ExecuteCodeDto } from './dto/execute-code.dto';

type StreamEvent =
  | { type: 'out'; data: string }
  | { type: 'err'; data: string }
  | { type: 'end'; result: RunResult }
  | { type: 'error'; message: string };

@Controller('execute')
export class CodeExecutionController {
  constructor(private readonly codeExecutionService: CodeExecutionService) {}

  @Get('languages')
  async getLanguages(): Promise<LanguageInfo[]> {
    return this.codeExecutionService.listLanguages();
  }

  @Post()
  async run(@Body() dto: ExecuteCodeDto) {
    this.validate(dto);
    return this.codeExecutionService.execute(dto.code, dto.language, {
      stdin: dto.stdin,
      runId: dto.runId,
      interactive: dto.interactive,
    });
  }

  @Post('stream')
  async stream(@Body() dto: ExecuteCodeDto, @Res() res: Response) {
    this.validate(dto);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (event: StreamEvent) => {
      res.write(`${JSON.stringify(event)}\n`);
    };

    res.on('close', () => {
      if (dto.runId) this.codeExecutionService.cancel(dto.runId);
    });

    try {
      const result = await this.codeExecutionService.execute(
        dto.code,
        dto.language,
        {
          stdin: dto.stdin,
          runId: dto.runId,
          interactive: dto.interactive,
          onStdout: (data) => write({ type: 'out', data }),
          onStderr: (data) => write({ type: 'err', data }),
        },
      );
      write({ type: 'end', result });
    } catch (err) {
      write({
        type: 'error',
        message: err instanceof Error ? err.message : 'Execution failed',
      });
    } finally {
      res.end();
    }
  }

  @Post(':runId/stdin')
  writeStdin(@Param('runId') runId: string, @Body() body: { data?: string }) {
    const data = typeof body?.data === 'string' ? body.data : '';
    return { written: this.codeExecutionService.write(runId, data) };
  }

  @Delete(':runId')
  cancel(@Param('runId') runId: string) {
    return { cancelled: this.codeExecutionService.cancel(runId) };
  }

  private validate(dto: ExecuteCodeDto) {
    if (!dto.code || typeof dto.code !== 'string') {
      throw new BadRequestException('code must be a non-empty string');
    }
    if (!dto.language || !this.codeExecutionService.isSupported(dto.language)) {
      throw new BadRequestException(
        'language must be one of the known languages',
      );
    }
  }
}
