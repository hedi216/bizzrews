import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { BusinessInputDto, UpdateBusinessDto } from './dto/business.dto';
import { OrganizationAccessService } from './organization-access.service';

const businessSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  timezone: true,
  defaultCurrency: true,
  marketplaceVisibility: true,
  logoMedia: { select: { id: true } },
} as const;

@Injectable()
export class BusinessesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: OrganizationAccessService,
  ) {}

  async create(
    userId: string,
    organizationId: string,
    input: BusinessInputDto,
  ) {
    await this.access.requireOrganization(userId, organizationId, true);
    this.validateTimezone(input.timezone);
    try {
      return await this.database.client.business.create({
        data: {
          organizationId,
          ...input,
          description: input.description ?? null,
        },
        select: businessSelect,
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async list(userId: string, organizationId: string) {
    await this.access.requireOrganization(userId, organizationId);
    return {
      businesses: await this.database.client.business.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: businessSelect,
      }),
    };
  }

  async get(userId: string, businessId: string) {
    await this.access.requireBusiness(userId, businessId);
    return this.database.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: businessSelect,
    });
  }

  async update(userId: string, businessId: string, input: UpdateBusinessDto) {
    if (Object.values(input).every((value) => value === undefined))
      throw new BadRequestException('At least one field is required.');
    await this.access.requireBusiness(userId, businessId, true);
    if (input.timezone) this.validateTimezone(input.timezone);
    try {
      return await this.database.client.business.update({
        where: { id: businessId },
        data: input,
        select: businessSelect,
      });
    } catch (error) {
      this.rethrowConflict(error);
    }
  }

  async rewards(userId: string, businessId: string) {
    await this.access.requireBusiness(userId, businessId, true);
    const account = await this.database.client.businessRewardAccount.findFirst({
      where: { businessId },
      select: {
        id: true,
        balance: true,
        updatedAt: true,
        transactions: {
          take: 100,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            type: true,
            pointsDelta: true,
            balanceAfter: true,
            description: true,
            createdAt: true,
          },
        },
      },
    });
    return (
      account ?? { id: null, balance: 0, updatedAt: null, transactions: [] }
    );
  }
  async marketplace(
    userId: string,
    businessId: string,
    marketplaceVisibility: 'UNLISTED' | 'LISTED',
  ) {
    await this.access.requireBusiness(userId, businessId, true);
    return this.database.client.business.update({
      where: { id: businessId },
      data: { marketplaceVisibility },
      select: businessSelect,
    });
  }

  private validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('Invalid IANA timezone.');
    }
  }

  private rethrowConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException('Business slug is already in use.');
    throw error;
  }
}
