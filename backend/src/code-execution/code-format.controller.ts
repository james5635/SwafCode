import {
  Controller,
  Post,
  Body,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { CodeExecutionService } from './code-execution.service';
import { FormatCodeDto } from './dto/format-code.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('format')
export class CodeFormatController {
  constructor(private readonly codeExecutionService: CodeExecutionService) {}

  @Post()
  @UseGuards(AuthGuard)
  async format(@Body() dto: FormatCodeDto) {
    if (!dto.code || typeof dto.code !== 'string') {
      throw new BadRequestException('code must be a non-empty string');
    }
    if (!dto.language || !this.codeExecutionService.isSupported(dto.language)) {
      throw new BadRequestException(
        'language must be one of the known languages',
      );
    }

    try {
      const code = await this.codeExecutionService.format(
        dto.code,
        dto.language,
      );
      return { code };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Formatting failed',
      );
    }
  }
}
