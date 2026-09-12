import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthRateLimit, AuthRateLimitGuard } from '../auth/rate-limit';
import { CreateReservationDto } from './dto/booking.dto';
import { PublicBookingService } from './public-booking.service';
import { SchedulingService } from './scheduling.service';
@Controller({
  path: 'public/businesses/:businessSlug/experiences/:experienceSlug',
  version: '1',
})
export class PublicBookingController {
  constructor(
    private s: PublicBookingService,
    private scheduling: SchedulingService,
  ) {}
  @Get() get(
    @Param('businessSlug') b: string,
    @Param('experienceSlug') e: string,
  ) {
    return this.s.experience(b, e);
  }
  @Get('occurrences') occurrences(
    @Param('businessSlug') b: string,
    @Param('experienceSlug') e: string,
  ) {
    return this.s.occurrences(b, e);
  }
  @Get('slots') slots(
    @Param('businessSlug') b: string,
    @Param('experienceSlug') e: string,
    @Query('date') date: string,
    @Query('resourceId', new ParseUUIDPipe({ optional: true }))
    resourceId?: string,
  ) {
    return this.scheduling.publicSlots(b, e, date, resourceId);
  }
  @Post('reservations')
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(20, 15 * 60_000)
  reserve(
    @Param('businessSlug') b: string,
    @Param('experienceSlug') e: string,
    @Body() body: CreateReservationDto,
  ) {
    return this.s.reserve(b, e, body);
  }
}
