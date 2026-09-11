import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { loadAuthConfig } from './auth/auth.config';

export function configureApp(app: INestApplication): void {
  const config = loadAuthConfig();
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();
}
