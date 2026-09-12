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
import { DraftFieldsController } from './draft-fields.controller';
import { DraftFieldsService } from './draft-fields.service';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { OccurrencesController } from './occurrences.controller';
import { OccurrencesService } from './occurrences.service';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    OrganizationsController,
    BusinessesController,
    ExperiencesController,
    DraftFieldsController,
    PublicBookingController,
    ReservationsController,
    OccurrencesController,
    ResourcesController,
  ],
  providers: [
    OrganizationsService,
    OrganizationAccessService,
    BusinessesService,
    ExperiencesService,
    DraftFieldsService,
    PublicBookingService,
    ReservationsService,
    OccurrencesService,
    ResourcesService,
    SchedulingService,
  ],
})
export class OrganizationsModule {}
