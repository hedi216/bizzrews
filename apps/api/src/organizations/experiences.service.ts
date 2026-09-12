import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '@bizzres/database';
import type {
  CreateExperienceDto,
  UpdateDraftDto,
  UpdateExperienceDto,
} from './dto/experience.dto';
import { OrganizationAccessService } from './organization-access.service';
import {
  optionTypes,
  validateFieldKey,
  validateFieldRules,
} from './field-validation';

const revisionSelect = {
  id: true,
  version: true,
  name: true,
  description: true,
  cancellationTerms: true,
  priceAmount: true,
  currency: true,
  publishedAt: true,
  schedulingMode: true,
  durationMinutes: true,
  slotIntervalMinutes: true,
  bufferBeforeMinutes: true,
  bufferAfterMinutes: true,
  pageBlocks: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    select: { id: true, type: true, position: true, config: true },
  },
} satisfies Prisma.ExperienceRevisionSelect;

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
      select: revisionSelect,
    });
    if (drafts.length > 1)
      throw new InternalServerErrorException(
        'Experience draft integrity error.',
      );
    if (drafts.length === 0)
      throw new ConflictException(
        'No editable draft exists for this experience.',
      );
    const scheduling = this.scheduling({
      schedulingMode: input.schedulingMode ?? drafts[0]!.schedulingMode,
      durationMinutes: input.durationMinutes ?? drafts[0]!.durationMinutes,
      slotIntervalMinutes:
        input.slotIntervalMinutes ?? drafts[0]!.slotIntervalMinutes,
      bufferBeforeMinutes:
        input.bufferBeforeMinutes ?? drafts[0]!.bufferBeforeMinutes,
      bufferAfterMinutes:
        input.bufferAfterMinutes ?? drafts[0]!.bufferAfterMinutes,
    });
    const draft = await this.database.client.experienceRevision.update({
      where: { id: drafts[0]!.id },
      data: { ...input, ...scheduling },
      select: revisionSelect,
    });
    return this.revision(draft);
  }

  async publish(userId: string, experienceId: string) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId}::uuid FOR UPDATE`;
      const experience = await tx.experience.findFirst({
        where: {
          id: experienceId,
          archivedAt: null,
          business: { archivedAt: null },
        },
        select: {
          id: true,
          slug: true,
          acceptingReservations: true,
          organizationId: true,
          business: {
            select: {
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
          },
        },
      });
      if (!experience || !experience.business.organization.members[0])
        throw new NotFoundException('Resource not found.');
      if (experience.business.organization.members[0].role === 'STAFF')
        throw new ForbiddenException();
      const drafts = await tx.experienceRevision.findMany({
        where: { experienceId, publishedAt: null },
        take: 2,
        include: { fields: { include: { options: true } } },
      });
      if (drafts.length > 1)
        throw new InternalServerErrorException(
          'Experience draft integrity error.',
        );
      const draft = drafts[0];
      if (!draft)
        throw new ConflictException(
          'No editable draft exists for this experience.',
        );
      this.scheduling(draft);
      if (
        draft.schedulingMode === 'GENERATED_SLOTS' &&
        !(await tx.experienceResource.count({
          where: { experienceId, active: true, resource: { active: true } },
        }))
      )
        throw new ConflictException(
          'Generated scheduling requires an active assigned resource.',
        );
      await tx.$queryRaw`SELECT "id" FROM "ExperienceRevision" WHERE "id" = ${draft.id}::uuid FOR UPDATE`;
      for (const field of draft.fields) {
        validateFieldKey(field.key);
        validateFieldRules(
          field.type,
          field.validation as Record<string, unknown> | null,
        );
        if (optionTypes.includes(field.type) && field.options.length === 0)
          throw new ConflictException(
            'Choice fields require at least one option.',
          );
        if (!optionTypes.includes(field.type) && field.options.length !== 0)
          throw new ConflictException('This field type cannot have options.');
      }
      const now = new Date();
      const published = await tx.experienceRevision.update({
        where: { id: draft.id },
        data: { publishedAt: now },
        select: revisionSelect,
      });
      const updated = await tx.experience.update({
        where: { id: experienceId },
        data: { publishedRevisionId: draft.id },
        select: {
          id: true,
          slug: true,
          publishedRevisionId: true,
          acceptingReservations: true,
        },
      });
      return {
        experience: updated,
        publishedRevision: this.revision(published),
      };
    });
  }

  async createDraft(userId: string, experienceId: string) {
    return this.database.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId}::uuid FOR UPDATE`;
      const experience = await tx.experience.findFirst({
        where: {
          id: experienceId,
          archivedAt: null,
          business: { archivedAt: null },
        },
        select: {
          id: true,
          organizationId: true,
          publishedRevisionId: true,
          business: {
            select: {
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
          },
        },
      });
      if (!experience || !experience.business.organization.members[0])
        throw new NotFoundException('Resource not found.');
      if (experience.business.organization.members[0].role === 'STAFF')
        throw new ForbiddenException();
      if (!experience.publishedRevisionId)
        throw new ConflictException(
          'No published revision exists for this experience.',
        );
      if (
        await tx.experienceRevision.findFirst({
          where: { experienceId, publishedAt: null },
          select: { id: true },
        })
      )
        throw new ConflictException('An editable draft already exists.');
      const source = await tx.experienceRevision.findFirst({
        where: {
          id: experience.publishedRevisionId,
          experienceId,
          organizationId: experience.organizationId,
          publishedAt: { not: null },
        },
        include: {
          fields: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            include: {
              options: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
            },
          },
          pageBlocks: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
        },
      });
      if (!source)
        throw new InternalServerErrorException(
          'Published revision integrity error.',
        );
      const maximum = await tx.experienceRevision.aggregate({
        where: { experienceId },
        _max: { version: true },
      });
      const draft = await tx.experienceRevision.create({
        data: {
          organizationId: experience.organizationId,
          experienceId,
          version: (maximum._max.version ?? 0) + 1,
          name: source.name,
          description: source.description,
          cancellationTerms: source.cancellationTerms,
          priceAmount: source.priceAmount,
          currency: source.currency,
          schedulingMode: source.schedulingMode,
          durationMinutes: source.durationMinutes,
          slotIntervalMinutes: source.slotIntervalMinutes,
          bufferBeforeMinutes: source.bufferBeforeMinutes,
          bufferAfterMinutes: source.bufferAfterMinutes,
        },
        select: revisionSelect,
      });
      const fields = [];
      for (const field of source.fields) {
        const cloned = await tx.fieldDefinition.create({
          data: {
            organizationId: experience.organizationId,
            experienceId,
            revisionId: draft.id,
            key: field.key,
            label: field.label,
            type: field.type,
            required: field.required,
            position: field.position,
            placeholder: field.placeholder,
            helpText: field.helpText,
            validation: field.validation ?? undefined,
          },
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
          },
        });
        const options = [];
        for (const option of field.options)
          options.push(
            await tx.fieldOption.create({
              data: {
                organizationId: experience.organizationId,
                experienceId,
                revisionId: draft.id,
                fieldDefinitionId: cloned.id,
                key: option.key,
                label: option.label,
                position: option.position,
              },
              select: { id: true, key: true, label: true, position: true },
            }),
          );
        fields.push({ ...cloned, options });
      }
      const pageBlocks = [];
      for (const block of source.pageBlocks)
        pageBlocks.push(
          await tx.pageBlock.create({
            data: {
              organizationId: experience.organizationId,
              experienceId,
              revisionId: draft.id,
              type: block.type,
              position: block.position,
              config: block.config as Prisma.InputJsonValue,
            },
            select: { id: true, type: true, position: true, config: true },
          }),
        );
      return { ...this.revision(draft), fields, pageBlocks };
    });
  }
  async setReservations(userId: string, experienceId: string, open: boolean) {
    await this.access.requireExperience(userId, experienceId, true);
    if (open) {
      const e = await this.database.client.experience.findUniqueOrThrow({
        where: { id: experienceId },
        select: {
          publishedRevisionId: true,
          publishedRevision: { select: { publishedAt: true } },
        },
      });
      if (!e.publishedRevisionId || !e.publishedRevision?.publishedAt)
        throw new ConflictException('Experience must be published first.');
    }
    return this.database.client.experience.update({
      where: { id: experienceId },
      data: { acceptingReservations: open },
      select: {
        id: true,
        slug: true,
        publishedRevisionId: true,
        acceptingReservations: true,
      },
    });
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
  private scheduling(value: {
    schedulingMode: 'EXPLICIT_OCCURRENCES' | 'GENERATED_SLOTS';
    durationMinutes: number | null;
    slotIntervalMinutes: number | null;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  }) {
    if (value.schedulingMode === 'EXPLICIT_OCCURRENCES')
      return {
        schedulingMode: value.schedulingMode,
        durationMinutes: null,
        slotIntervalMinutes: null,
        bufferBeforeMinutes: value.bufferBeforeMinutes,
        bufferAfterMinutes: value.bufferAfterMinutes,
      };
    if (!value.durationMinutes || !value.slotIntervalMinutes)
      throw new BadRequestException(
        'Generated scheduling requires duration and slot interval.',
      );
    return value;
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
