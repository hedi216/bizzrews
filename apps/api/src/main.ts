import 'reflect-metadata';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
});
