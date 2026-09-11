import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  CreateExperienceDto,
  UpdateDraftDto,
  UpdateExperienceDto,
} from './dto/experience.dto';
import { OrganizationAccessService } from './organization-access.service';

const revisionSelect = {
  id: true,
  version: true,
  name: true,
  description: true,
  cancellationTerms: true,
  priceAmount: true,
  currency: true,
  publishedAt: true,
} as const;

@Injectable()
export class ExperiencesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: OrganizationAccessService,
  ) {}

  async create(userId: string, businessId: string, input: CreateExperienceDto) {
    try {
      const result = await this.database.client.$transaction(async (tx) => {
        const business = await tx.business.findFirst({
          where: {
            id: businessId,
            archivedAt: null,
            organization: { members: { some: { userId, active: true } } },
          },
          select: {
            id: true,
            organizationId: true,
            defaultCurrency: true,
            organization: {
              select: {
                members: {
                  where: { userId, active: true },
                  select: { role: true },
                  take: 1,
                },
              },
            },
          },
        });
        if (!business) throw new NotFoundException('Resource not found.');
        if (business.organization.members[0]?.role === 'STAFF')
          throw new ForbiddenException();
        const experience = await tx.experience.create({
          data: {
            organizationId: business.organizationId,
            businessId,
            slug: input.slug,
          },
          select: {
            id: true,
            businessId: true,
            slug: true,
            publishedRevisionId: true,
            acceptingReservations: true,
          },
        });
        const draft = await tx.experienceRevision.create({
          data: {
            organizationId: business.organizationId,
            experienceId: experience.id,
            version: 1,
            name: input.name,
            description: input.description ?? null,
            cancellationTerms: input.cancellationTerms ?? null,
            priceAmount: input.priceAmount ?? '0',
            currency: input.currency ?? business.defaultCurrency,
          },
          select: revisionSelect,
        });
        return { experience, draft };
      });
      return {
        experience: result.experience,
        draft: this.revision(result.draft),
      };
    } catch (error) {
      this.rethrowConflict(error, 'Experience slug is already in use.');
    }
  }

  async list(userId: string, businessId: string) {
    await this.access.requireBusiness(userId, businessId);
    const rows = await this.database.client.experience.findMany({
      where: { businessId, archivedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        acceptingReservations: true,
        publishedRevisionId: true,
        revisions: {
          where: { publishedAt: null },
          take: 2,
          orderBy: { version: 'desc' },
          select: revisionSelect,
        },
        publishedRevision: { select: revisionSelect },
      },
    });
    return {
      experiences: rows.map(
        ({ revisions, publishedRevision, ...experience }) => ({
          ...experience,
          publishedRevision: publishedRevision
            ? this.revision(publishedRevision)
            : null,
          draft: this.singleDraft(revisions),
        }),
      ),
    };
  }

  async get(userId: string, experienceId: string) {
    await this.access.requireExperience(userId, experienceId);
    const row = await this.database.client.experience.findUniqueOrThrow({
      where: { id: experienceId },
      select: {
        id: true,
        slug: true,
        acceptingReservations: true,
        publishedRevisionId: true,
        business: { select: { id: true, name: true, slug: true } },
        publishedRevision: { select: revisionSelect },
        revisions: {
          where: { publishedAt: null },
          take: 2,
          orderBy: { version: 'desc' },
          select: {
            ...revisionSelect,
            fields: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                key: true,
                label: true,
                type: true,
                required: true,
                position: true,
                placeholder: true,
                helpText: true,
                validation: true,
                options: {
                  orderBy: [{ position: 'asc' }, { id: 'asc' }],
                  select: { id: true, key: true, label: true, position: true },
                },
              },
            },
          },
        },
      },
    });
    const { revisions, publishedRevision, ...experience } = row;
    return {
      ...experience,
      publishedRevision: publishedRevision
        ? this.revision(publishedRevision)
        : null,
      draft: this.singleDraft(revisions),
    };
  }

  async update(
    userId: string,
    experienceId: string,
    input: UpdateExperienceDto,
  ) {
    if (!input.slug) throw new BadRequestException('A slug is required.');
    await this.access.requireExperience(userId, experienceId, true);
    try {
      return await this.database.client.experience.update({
        where: { id: experienceId },
        data: { slug: input.slug },
        select: {
          id: true,
          businessId: true,
          slug: true,
          publishedRevisionId: true,
          acceptingReservations: true,
        },
      });
    } catch (error) {
      this.rethrowConflict(error, 'Experience slug is already in use.');
    }
  }

  async updateDraft(
    userId: string,
    experienceId: string,
    input: UpdateDraftDto,
  ) {
    if (Object.values(input).every((value) => value === undefined))
      throw new BadRequestException('At least one field is required.');
    await this.access.requireExperience(userId, experienceId, true);
    const drafts = await this.database.client.experienceRevision.findMany({
      where: { experienceId, publishedAt: null },
      take: 2,
      select: { id: true },
    });
    if (drafts.length > 1)
      throw new InternalServerErrorException(
        'Experience draft integrity error.',
      );
    if (drafts.length === 0)
      throw new ConflictException(
        'No editable draft exists for this experience.',
      );
    const draft = await this.database.client.experienceRevision.update({
      where: { id: drafts[0]!.id },
      data: input,
      select: revisionSelect,
    });
    return this.revision(draft);
  }

  private singleDraft<
    T extends { priceAmount: { toFixed(digits: number): string } },
  >(drafts: T[]) {
    if (drafts.length > 1)
      throw new InternalServerErrorException(
        'Experience draft integrity error.',
      );
    return drafts[0] ? this.revision(drafts[0]) : null;
  }
  private revision<
    T extends { priceAmount: { toFixed(digits: number): string } },
  >(row: T) {
    return { ...row, priceAmount: row.priceAmount.toFixed(4) };
  }
  private rethrowConflict(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }
}
