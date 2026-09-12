import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import {
  CreateExperienceDto,
  UpdateDraftDto,
  UpdateExperienceDto,
} from './dto/experience.dto';
import { ExperiencesService } from './experiences.service';

@Controller({ version: '1' })
@UseGuards(AccessTokenGuard)
export class ExperiencesController {
  constructor(private readonly experiences: ExperiencesService) {}
  @Post('businesses/:businessId/experiences')
  create(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() input: CreateExperienceDto,
  ) {
    return this.experiences.create(auth.sub, businessId, input);
  }
  @Get('businesses/:businessId/experiences')
  list(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.experiences.list(auth.sub, businessId);
  }
  @Get('experiences/:experienceId')
  get(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
  ) {
    return this.experiences.get(auth.sub, experienceId);
  }
  @Patch('experiences/:experienceId')
  update(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
    @Body() input: UpdateExperienceDto,
  ) {
    return this.experiences.update(auth.sub, experienceId, input);
  }
  @Patch('experiences/:experienceId/draft')
  updateDraft(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
    @Body() input: UpdateDraftDto,
  ) {
    return this.experiences.updateDraft(auth.sub, experienceId, input);
  }
  @Post('experiences/:experienceId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
  ) {
    return this.experiences.publish(auth.sub, experienceId);
  }
  @Post('experiences/:experienceId/draft')
  createDraft(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
  ) {
    return this.experiences.createDraft(auth.sub, experienceId);
  }
  @Post('experiences/:experienceId/reservations/open')
  open(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) id: string,
  ) {
    return this.experiences.setReservations(auth.sub, id, true);
  }
  @Post('experiences/:experienceId/reservations/close')
  close(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) id: string,
  ) {
    return this.experiences.setReservations(auth.sub, id, false);
  }
}
