import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AccessTokenClaims } from '../auth/auth.types';
import { OccurrencesService } from './occurrences.service';
import { CreateOccurrenceDto, UpdateOccurrenceDto } from './dto/booking.dto';
@Controller({ version: '1' })
@UseGuards(AccessTokenGuard)
export class OccurrencesController {
  constructor(private s: OccurrencesService) {}
  @Post('experiences/:experienceId/occurrences') create(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Body() b: CreateOccurrenceDto,
  ) {
    return this.s.create(a.sub, e, b);
  }
  @Get('experiences/:experienceId/occurrences') list(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
  ) {
    return this.s.list(a.sub, e);
  }
  @Get('occurrences/:occurrenceId') get(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('occurrenceId', ParseUUIDPipe) o: string,
  ) {
    return this.s.get(a.sub, o);
  }
  @Patch('occurrences/:occurrenceId') update(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('occurrenceId', ParseUUIDPipe) o: string,
    @Body() b: UpdateOccurrenceDto,
  ) {
    return this.s.update(a.sub, o, b);
  }
  @Post('occurrences/:occurrenceId/cancel') cancel(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('occurrenceId', ParseUUIDPipe) o: string,
  ) {
    return this.s.cancel(a.sub, o);
  }
}
