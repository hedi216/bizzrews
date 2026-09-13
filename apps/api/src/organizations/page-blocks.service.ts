import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@bizzres/database';
import { DatabaseService } from '../database/database.service';
import type {
  CreatePageBlockDto,
  PageBlockTypeValue,
  UpdatePageBlockDto,
} from './dto/page-block.dto';
import { OrganizationAccessService } from './organization-access.service';

const select = { id: true, type: true, position: true, config: true } as const;
const allowed: Record<PageBlockTypeValue, string[]> = {
  HERO: ['headline', 'subheading'],
  TEXT: ['heading', 'body'],
  GALLERY: ['heading', 'images'],
  LOCATION: ['name', 'address', 'mapUrl'],
  ITINERARY: ['heading', 'items'],
  FORM: ['heading', 'submitLabel'],
  CTA: ['label', 'href'],
};
@Injectable()
export class PageBlocksService {
  constructor(
    private db: DatabaseService,
    private access: OrganizationAccessService,
  ) {}
  async create(u: string, e: string, input: CreatePageBlockDto) {
    const draft = await this.draft(u, e);
    this.validate(input.type, input.config);
    if (input.type === 'FORM') await this.ensureSingleForm(draft.id);
    return this.db.client.pageBlock.create({
      data: {
        organizationId: draft.organizationId,
        experienceId: e,
        revisionId: draft.id,
        type: input.type,
        position: input.position,
        config: input.config as Prisma.InputJsonValue,
      },
      select,
    });
  }
  async update(u: string, e: string, id: string, input: UpdatePageBlockDto) {
    if (Object.values(input).every((v) => v === undefined))
      throw new BadRequestException('At least one field is required.');
    const draft = await this.draft(u, e);
    const block = await this.db.client.pageBlock.findFirst({
      where: { id, experienceId: e, revisionId: draft.id },
    });
    if (!block) throw new NotFoundException('Resource not found.');
    const type = input.type ?? block.type;
    const config = input.config ?? block.config;
    this.validate(type, config as Record<string, unknown>);
    if (type === 'FORM' && block.type !== 'FORM')
      await this.ensureSingleForm(draft.id);
    return this.db.client.pageBlock.update({
      where: { id },
      data: {
        type: input.type,
        position: input.position,
        config: input.config as Prisma.InputJsonValue | undefined,
      },
      select,
    });
  }
  async remove(u: string, e: string, id: string) {
    const draft = await this.draft(u, e);
    const result = await this.db.client.pageBlock.deleteMany({
      where: { id, experienceId: e, revisionId: draft.id },
    });
    if (result.count !== 1) throw new NotFoundException('Resource not found.');
  }
  private validate(type: PageBlockTypeValue, config: Record<string, unknown>) {
    if (JSON.stringify(config).length > 20_000)
      throw new BadRequestException('Page block configuration is too large.');
    if (Object.keys(config).some((key) => !allowed[type].includes(key)))
      throw new BadRequestException('Unsupported page block configuration.');
    for (const [key, value] of Object.entries(config)) {
      if (['images', 'items'].includes(key)) {
        if (
          !Array.isArray(value) ||
          value.length > 20 ||
          value.some(
            (x) => typeof x !== 'string' || !x.trim() || x.length > 1000,
          )
        )
          throw new BadRequestException('Invalid page block list.');
      } else if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > 4000
      )
        throw new BadRequestException('Invalid page block text.');
      if (
        ['href', 'mapUrl'].includes(key) &&
        typeof value === 'string' &&
        !/^(https?:\/\/|\/)/.test(value)
      )
        throw new BadRequestException('Invalid page block link.');
      if (
        key === 'images' &&
        Array.isArray(value) &&
        value.some((item) => !/^https?:\/\//.test(item))
      )
        throw new BadRequestException('Invalid gallery image URL.');
    }
  }
  private async draft(u: string, e: string) {
    const experience = await this.access.requireExperience(u, e, true);
    const drafts = await this.db.client.experienceRevision.findMany({
      where: {
        organizationId: experience.organizationId,
        experienceId: e,
        publishedAt: null,
      },
      take: 2,
      select: { id: true, organizationId: true },
    });
    if (drafts.length > 1)
      throw new InternalServerErrorException(
        'Experience draft integrity error.',
      );
    if (!drafts[0])
      throw new ConflictException(
        'No editable draft exists for this experience.',
      );
    return drafts[0];
  }
  private async ensureSingleForm(revisionId: string) {
    if (
      await this.db.client.pageBlock.count({
        where: { revisionId, type: 'FORM' },
      })
    )
      throw new ConflictException(
        'A booking form block already exists in this draft.',
      );
  }
}
