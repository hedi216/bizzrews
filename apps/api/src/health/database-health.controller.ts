import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller({ path: 'health/database', version: '1' })
export class DatabaseHealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'reachable' }> {
    if (!(await this.database.isReachable())) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unavailable',
      });
    }
    return { status: 'ok', database: 'reachable' };
  }
}
