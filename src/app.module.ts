import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CodeExecutionModule } from './code-execution/code-execution.module';

@Module({
  imports: [CodeExecutionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
