import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CustomersService } from './customers.service';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

@Controller({ path: 'customers/me', version: '1' })
@UseGuards(AccessTokenGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Patch('profile')
  profile(
    @CurrentAuth() auth: AccessTokenClaims,
    @Body() input: UpdateCustomerProfileDto,
  ) {
    return this.customers.profile(auth.sub, input);
  }

  @Get('reservations')
  reservations(@CurrentAuth() auth: AccessTokenClaims) {
    return this.customers.reservations(auth.sub);
  }

  @Get('loyalty')
  loyalty(@CurrentAuth() auth: AccessTokenClaims) {
    return this.customers.loyalty(auth.sub);
  }
}
