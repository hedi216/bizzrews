import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from '../database/database.module';
import { DatabaseHealthController } from './database-health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, DatabaseHealthController],
})
export class HealthModule {}
