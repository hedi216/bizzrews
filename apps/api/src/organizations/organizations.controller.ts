import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller({ path: 'organizations', version: '1' })
@UseGuards(AccessTokenGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  create(
    @CurrentAuth() auth: AccessTokenClaims,
    @Body() input: CreateOrganizationDto,
  ) {
    return this.organizations.create(auth.sub, input);
  }

  @Get()
  list(@CurrentAuth() auth: AccessTokenClaims) {
    return this.organizations.list(auth.sub);
  }
}
