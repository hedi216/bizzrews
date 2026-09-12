import { Controller, Get, Query } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

@Controller({ path: 'marketplace', version: '1' })
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}
  @Get()
  search(@Query('query') query?: string) {
    return this.marketplace.search(query);
  }
}
