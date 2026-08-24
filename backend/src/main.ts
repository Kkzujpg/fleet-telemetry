import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  app.setGlobalPrefix('api/v1');
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
