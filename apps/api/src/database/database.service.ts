import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@bizzres/database';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private prisma: PrismaClient | undefined;

  get client(): PrismaClient {
    if (!this.prisma) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return this.prisma;
  }

  async onModuleInit(): Promise<void> {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) {
      this.logger.warn(
        'Database not configured; process health remains available.',
      );
      return;
    }
    try {
      this.prisma = createPrismaClient(url);
      await this.prisma.$connect();
    } catch {
      // Keep the same client so later requests can recover after a DB outage.
      this.logger.warn(
        'Database unavailable; process health remains available.',
      );
    }
  }

  async isReachable(): Promise<boolean> {
    if (!this.prisma) return false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.prisma?.$disconnect();
    } catch {
      this.logger.warn('Database disconnect failed.');
    }
  }
}
