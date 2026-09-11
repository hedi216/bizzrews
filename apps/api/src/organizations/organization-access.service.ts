import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class OrganizationAccessService {
  constructor(private readonly database: DatabaseService) {}

  async requireOrganization(
    userId: string,
    organizationId: string,
    write = false,
  ) {
    const membership = await this.database.client.organizationMember.findFirst({
      where: { userId, organizationId, active: true },
      select: { role: true },
    });
    if (!membership) throw new NotFoundException('Resource not found.');
    if (write && membership.role === 'STAFF') throw new ForbiddenException();
    return membership;
  }

  async requireBusiness(userId: string, businessId: string, write = false) {
    const business = await this.database.client.business.findFirst({
      where: { id: businessId, archivedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!business) throw new NotFoundException('Resource not found.');
    await this.requireOrganization(userId, business.organizationId, write);
    return business;
  }

  async requireExperience(userId: string, experienceId: string, write = false) {
    const experience = await this.database.client.experience.findFirst({
      where: {
        id: experienceId,
        archivedAt: null,
        business: { archivedAt: null },
      },
      select: { id: true, organizationId: true, businessId: true },
    });
    if (!experience) throw new NotFoundException('Resource not found.');
    await this.requireOrganization(userId, experience.organizationId, write);
    return experience;
  }
}
