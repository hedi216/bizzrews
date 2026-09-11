import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationAccessService } from './organization-access.service';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { ExperiencesController } from './experiences.controller';
import { ExperiencesService } from './experiences.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    OrganizationsController,
    BusinessesController,
    ExperiencesController,
  ],
  providers: [
    OrganizationsService,
    OrganizationAccessService,
    BusinessesService,
    ExperiencesService,
  ],
})
export class OrganizationsModule {}
