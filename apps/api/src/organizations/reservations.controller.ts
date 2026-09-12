import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CancelReservationDto } from './dto/booking.dto';
import { ReservationsService } from './reservations.service';
@Controller({ version: '1' })
@UseGuards(AccessTokenGuard)
export class ReservationsController {
  constructor(private s: ReservationsService) {}
  @Get('experiences/:experienceId/reservations') list(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
  ) {
    return this.s.list(a.sub, e);
  }
  @Get('reservations/:reservationId') get(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('reservationId', ParseUUIDPipe) r: string,
  ) {
    return this.s.get(a.sub, r);
  }
  @Post('reservations/:reservationId/cancel') cancel(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('reservationId', ParseUUIDPipe) r: string,
    @Body() b: CancelReservationDto,
  ) {
    return this.s.cancel(a.sub, r, b);
  }
}
