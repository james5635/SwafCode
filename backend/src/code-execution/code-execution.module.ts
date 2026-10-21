import { Module } from '@nestjs/common';
import { CodeExecutionController } from './code-execution.controller';
import { CodeFormatController } from './code-format.controller';
import { CodeExecutionService } from './code-execution.service';

@Module({
  controllers: [CodeExecutionController, CodeFormatController],
  providers: [CodeExecutionService],
})
export class CodeExecutionModule {}
