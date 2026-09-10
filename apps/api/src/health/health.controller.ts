import { Controller, Get } from '@nestjs/common';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
