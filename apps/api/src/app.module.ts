import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { CustomersModule } from './customers/customers.module';

@Module({
  imports: [HealthModule, AuthModule, OrganizationsModule, CustomersModule],
})
export class AppModule {}
