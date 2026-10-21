import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CodeExecutionService,
  LanguageInfo,
  RunResult,
} from './code-execution.service';
import { ExecuteCodeDto } from './dto/execute-code.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { TokenPayload } from '../auth/auth.guard';

@Controller('execute')
export class CodeExecutionController {
  constructor(private readonly codeExecutionService: CodeExecutionService) {}

  @Get('languages')
  async getLanguages(): Promise<LanguageInfo[]> {
    return this.codeExecutionService.listLanguages();
  }

  @Post()
  @UseGuards(AuthGuard)
  async run(@Body() dto: ExecuteCodeDto, @CurrentUser() user: TokenPayload) {
    this.validate(dto);
    return this.codeExecutionService.execute(dto.code, dto.language, {
      stdin: dto.stdin,
      runId: dto.runId,
      interactive: dto.interactive,
      userId: user.sub,
    });
  }

  @Post('stream')
  @UseGuards(AuthGuard)
  async stream(
    @Body() dto: ExecuteCodeDto,
    @Res() res: Response,
    @CurrentUser() user: TokenPayload,
  ) {
    this.validate(dto);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (event: {
      type: string;
      data?: string;
      result?: RunResult;
      message?: string;
    }) => {
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
          userId: user.sub,
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
  @UseGuards(AuthGuard)
  writeStdin(
    @Param('runId') runId: string,
    @Body() body: { data?: string },
    @CurrentUser() user: TokenPayload,
  ) {
    const data = typeof body?.data === 'string' ? body.data : '';
    return { written: this.codeExecutionService.write(runId, data, user.sub) };
  }

  @Delete(':runId')
  @UseGuards(AuthGuard)
  cancel(@Param('runId') runId: string, @CurrentUser() user: TokenPayload) {
    return { cancelled: this.codeExecutionService.cancel(runId, user.sub) };
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
