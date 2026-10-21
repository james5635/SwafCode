import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CodeExecutionModule } from './code-execution/code-execution.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MongoModule } from './mongodb.module';

@Module({
  imports: [MongoModule, CodeExecutionModule, AuthModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
