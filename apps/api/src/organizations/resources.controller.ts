import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AccessTokenClaims } from '../auth/auth.types';
import {
  AvailabilityOverrideDto,
  CreateResourceDto,
  ReplaceWeeklyAvailabilityDto,
  UpdateResourceDto,
} from './dto/scheduling.dto';
import { ResourcesService } from './resources.service';

@Controller({ version: '1' })
@UseGuards(AccessTokenGuard)
export class ResourcesController {
  constructor(private s: ResourcesService) {}
  @Post('businesses/:businessId/resources') create(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) id: string,
    @Body() b: CreateResourceDto,
  ) {
    return this.s.create(a.sub, id, b);
  }
  @Get('businesses/:businessId/resources') list(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) id: string,
  ) {
    return this.s.list(a.sub, id);
  }
  @Patch('resources/:resourceId') update(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('resourceId', ParseUUIDPipe) id: string,
    @Body() b: UpdateResourceDto,
  ) {
    return this.s.update(a.sub, id, b);
  }
  @Post('experiences/:experienceId/resources/:resourceId') assign(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('resourceId', ParseUUIDPipe) r: string,
  ) {
    return this.s.assign(a.sub, e, r);
  }
  @Delete('experiences/:experienceId/resources/:resourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unassign(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('resourceId', ParseUUIDPipe) r: string,
  ) {
    await this.s.unassign(a.sub, e, r);
  }
  @Get('experiences/:experienceId/resources') assignments(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
  ) {
    return this.s.assignments(a.sub, e);
  }
  @Put('resources/:resourceId/weekly-availability') weeklyPut(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('resourceId', ParseUUIDPipe) r: string,
    @Body() b: ReplaceWeeklyAvailabilityDto,
  ) {
    return this.s.replaceWeekly(a.sub, r, b);
  }
  @Get('resources/:resourceId/weekly-availability') weeklyGet(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('resourceId', ParseUUIDPipe) r: string,
  ) {
    return this.s.weekly(a.sub, r);
  }
  @Put('resources/:resourceId/availability-overrides/:date') overridePut(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('resourceId', ParseUUIDPipe) r: string,
    @Param('date') date: string,
    @Body() b: AvailabilityOverrideDto,
  ) {
    return this.s.putOverride(a.sub, r, date, b);
  }
  @Get('resources/:resourceId/availability-overrides') overrides(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('resourceId', ParseUUIDPipe) r: string,
  ) {
    return this.s.overrides(a.sub, r);
  }
  @Delete('resources/:resourceId/availability-overrides/:date')
  @HttpCode(HttpStatus.NO_CONTENT)
  async overrideDelete(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('resourceId', ParseUUIDPipe) r: string,
    @Param('date') date: string,
  ) {
    await this.s.deleteOverride(a.sub, r, date);
  }
}
