import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({ imports: [HealthModule, AuthModule, OrganizationsModule] })
export class AppModule {}
