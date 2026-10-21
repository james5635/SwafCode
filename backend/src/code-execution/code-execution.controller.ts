import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { CodeExecutionService } from './code-execution.service';
import { ExecuteCodeDto } from './dto/execute-code.dto';

const LANGUAGES = [
  { id: 'typescript', name: 'TypeScript', runtime: 'tsx', filename: 'code.ts' },
  { id: 'python', name: 'Python', runtime: 'python3', filename: 'code.py' },
  { id: 'java', name: 'Java', runtime: 'openjdk', filename: 'Main.java' },
  { id: 'cpp', name: 'C++', runtime: 'g++', filename: 'code.cpp' },
  { id: 'rust', name: 'Rust', runtime: 'rustc', filename: 'code.rs' },
  { id: 'go', name: 'Go', runtime: 'go', filename: 'code.go' },
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

    return this.codeExecutionService.execute(dto.code, dto.language, dto.stdin);
  }
}
