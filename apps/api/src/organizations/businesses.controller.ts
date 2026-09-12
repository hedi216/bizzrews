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
import type { AccessTokenClaims } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { BusinessesService } from './businesses.service';
import {
  BusinessInputDto,
  UpdateBusinessDto,
  UpdateMarketplaceVisibilityDto,
} from './dto/business.dto';

@Controller({ version: '1' })
@UseGuards(AccessTokenGuard)
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Post('organizations/:organizationId/businesses')
  create(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() input: BusinessInputDto,
  ) {
    return this.businesses.create(auth.sub, organizationId, input);
  }
  @Get('organizations/:organizationId/businesses')
  list(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.businesses.list(auth.sub, organizationId);
  }
  @Get('businesses/:businessId')
  get(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.businesses.get(auth.sub, businessId);
  }
  @Patch('businesses/:businessId')
  update(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() input: UpdateBusinessDto,
  ) {
    return this.businesses.update(auth.sub, businessId, input);
  }

  @Get('businesses/:businessId/rewards')
  rewards(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.businesses.rewards(auth.sub, businessId);
  }
  @Patch('businesses/:businessId/marketplace')
  marketplace(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() input: UpdateMarketplaceVisibilityDto,
  ) {
    return this.businesses.marketplace(
      auth.sub,
      businessId,
      input.marketplaceVisibility,
    );
  }
}
