import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, input: CreateOrganizationDto) {
    this.assertTimezone(input.business.timezone);
    try {
      return await this.database.client.$transaction(async (transaction) => {
        const user = await transaction.user.findFirst({
          where: { id: userId, disabledAt: null },
          select: { id: true },
        });
        if (!user) throw new UnauthorizedException('Unauthorized.');

        const organization = await transaction.organization.create({
          data: { name: input.organizationName },
          select: { id: true, name: true },
        });
        const membership = await transaction.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: 'OWNER',
            active: true,
          },
          select: { id: true, role: true, active: true },
        });
        const business = await transaction.business.create({
          data: {
            organizationId: organization.id,
            name: input.business.name,
            slug: input.business.slug,
            description: input.business.description ?? null,
            timezone: input.business.timezone,
            defaultCurrency: input.business.defaultCurrency,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            timezone: true,
            defaultCurrency: true,
            marketplaceVisibility: true,
            logoMedia: { select: { id: true } },
          },
        });
        return { organization, membership, business };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Business slug is already in use.');
      }
      throw error;
    }
  }

  async list(userId: string) {
    const memberships = await this.database.client.organizationMember.findMany({
      where: { userId, active: true },
      orderBy: [
        { organization: { createdAt: 'asc' } },
        { organizationId: 'asc' },
      ],
      select: {
        id: true,
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            businesses: {
              where: { archivedAt: null },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                timezone: true,
                defaultCurrency: true,
                marketplaceVisibility: true,
                logoMedia: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    return {
      organizations: memberships.map(({ id, role, organization }) => ({
        id: organization.id,
        name: organization.name,
        role,
        membershipId: id,
        businesses: organization.businesses,
      })),
    };
  }

  private assertTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('Invalid IANA timezone.');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
