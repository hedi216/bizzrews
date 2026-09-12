import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthRateLimit, AuthRateLimitGuard } from '../auth/rate-limit';
import { CreateReservationDto } from './dto/booking.dto';
import { PublicBookingService } from './public-booking.service';
@Controller({
  path: 'public/businesses/:businessSlug/experiences/:experienceSlug',
  version: '1',
})
export class PublicBookingController {
  constructor(private s: PublicBookingService) {}
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
