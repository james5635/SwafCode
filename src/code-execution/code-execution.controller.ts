import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { CodeExecutionService } from './code-execution.service';
import { ExecuteCodeDto } from './dto/execute-code.dto';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript', version: 'node' },
  { id: 'python', name: 'Python', version: 'python3' },
];

@Controller('execute')
export class CodeExecutionController {
  constructor(private readonly codeExecutionService: CodeExecutionService) {}

  @Get('languages')
  getLanguages() {
    return LANGUAGES;
  }

  @Post()
  async run(@Body() dto: ExecuteCodeDto) {
    if (!dto.code || typeof dto.code !== 'string') {
      throw new BadRequestException('code must be a non-empty string');
    }
    if (!dto.language || !['python', 'javascript'].includes(dto.language)) {
      throw new BadRequestException(
        "language must be 'python' or 'javascript'",
      );
    }

    return this.codeExecutionService.execute(dto.code, dto.language);
  }
}
