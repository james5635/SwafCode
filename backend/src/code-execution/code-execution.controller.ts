import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { CodeExecutionService } from './code-execution.service';
import { ExecuteCodeDto } from './dto/execute-code.dto';

const LANGUAGES = [
  { id: 'typescript', name: 'TypeScript', version: 'tsx' },
  { id: 'python', name: 'Python', version: 'python3' },
  { id: 'java', name: 'Java', version: 'openjdk' },
  { id: 'cpp', name: 'C++', version: 'g++' },
  { id: 'rust', name: 'Rust', version: 'rustc' },
  { id: 'go', name: 'Go', version: 'go' },
];

const SUPPORTED_LANGUAGES = LANGUAGES.map((l) => l.id);

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
    if (!dto.language || !SUPPORTED_LANGUAGES.includes(dto.language)) {
      throw new BadRequestException(
        `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }

    return this.codeExecutionService.execute(dto.code, dto.language);
  }
}
