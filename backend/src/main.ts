import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.warn(
      '[swafcode] JWT_SECRET is not set. Every deployment would share the same secret, so anybody could mint a token. Set it before going live.',
    );
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
