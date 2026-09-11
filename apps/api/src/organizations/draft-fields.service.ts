import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '@bizzres/database';
import type {
  CreateFieldDto,
  CreateOptionDto,
  UpdateFieldDto,
  UpdateOptionDto,
} from './dto/field.dto';
import {
  optionTypes,
  validateFieldKey,
  validateFieldRules,
} from './field-validation';
import { OrganizationAccessService } from './organization-access.service';

const optionSelect = {
  id: true,
  key: true,
  label: true,
  position: true,
} as const;
const fieldSelect = {
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
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    select: optionSelect,
  },
};

@Injectable()
export class DraftFieldsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: OrganizationAccessService,
  ) {}

  async createField(
    userId: string,
    experienceId: string,
    input: CreateFieldDto,
  ) {
    const draft = await this.draft(userId, experienceId);
    validateFieldKey(input.key);
    const validation = validateFieldRules(input.type, input.validation);
    try {
      return await this.database.client.fieldDefinition.create({
        data: {
          organizationId: draft.organizationId,
          experienceId,
          revisionId: draft.id,
          ...input,
          validation:
            validation === null
              ? Prisma.DbNull
              : (validation as Prisma.InputJsonValue),
        },
        select: fieldSelect,
      });
    } catch (error) {
      this.rethrowConflict(error, 'Field key is already in use.');
    }
  }
  async updateField(
    userId: string,
    experienceId: string,
    fieldId: string,
    input: UpdateFieldDto,
  ) {
    if (Object.values(input).every((value) => value === undefined))
      throw new BadRequestException('At least one field is required.');
    const draft = await this.draft(userId, experienceId);
    const field = await this.field(draft.id, experienceId, fieldId);
    if (input.key) validateFieldKey(input.key);
    const type = input.type ?? field.type;
    const validation =
      input.validation === undefined
        ? input.type === undefined
          ? undefined
          : validateFieldRules(
              type,
              field.validation as Record<string, unknown> | null,
            )
        : validateFieldRules(type, input.validation);
    if (input.type && !optionTypes.includes(input.type) && field.options.length)
      throw new ConflictException(
        'Remove field options before changing its type.',
      );
    try {
      return await this.database.client.fieldDefinition.update({
        where: { id: fieldId },
        data: {
          ...input,
          validation:
            validation === undefined
              ? undefined
              : validation === null
                ? Prisma.DbNull
                : (validation as Prisma.InputJsonValue),
        },
        select: fieldSelect,
      });
    } catch (error) {
      this.rethrowConflict(error, 'Field key is already in use.');
    }
  }
  async deleteField(
    userId: string,
    experienceId: string,
    fieldId: string,
  ): Promise<void> {
    const draft = await this.draft(userId, experienceId);
    const field = await this.field(draft.id, experienceId, fieldId);
    if (field.options.length)
      throw new ConflictException(
        'Remove field options before deleting the field.',
      );
    try {
      await this.database.client.fieldDefinition.delete({
        where: { id: fieldId },
      });
    } catch (error) {
      this.rethrowConflict(error, 'Field is referenced and cannot be deleted.');
    }
  }
  async createOption(
    userId: string,
    experienceId: string,
    fieldId: string,
    input: CreateOptionDto,
  ) {
    const draft = await this.draft(userId, experienceId);
    const field = await this.field(draft.id, experienceId, fieldId);
    if (!optionTypes.includes(field.type))
      throw new BadRequestException(
        'This field type does not support options.',
      );
    try {
      return await this.database.client.fieldOption.create({
        data: {
          organizationId: draft.organizationId,
          experienceId,
          revisionId: draft.id,
          fieldDefinitionId: fieldId,
          ...input,
        },
        select: optionSelect,
      });
    } catch (error) {
      this.rethrowConflict(error, 'Option key is already in use.');
    }
  }
  async updateOption(
    userId: string,
    experienceId: string,
    fieldId: string,
    optionId: string,
    input: UpdateOptionDto,
  ) {
    if (Object.values(input).every((value) => value === undefined))
      throw new BadRequestException('At least one field is required.');
    const draft = await this.draft(userId, experienceId);
    await this.field(draft.id, experienceId, fieldId);
    const option = await this.database.client.fieldOption.findFirst({
      where: {
        id: optionId,
        fieldDefinitionId: fieldId,
        revisionId: draft.id,
        experienceId,
      },
    });
    if (!option) throw new NotFoundException('Resource not found.');
    try {
      return await this.database.client.fieldOption.update({
        where: { id: optionId },
        data: input,
        select: optionSelect,
      });
    } catch (error) {
      this.rethrowConflict(error, 'Option key is already in use.');
    }
  }
  async deleteOption(
    userId: string,
    experienceId: string,
    fieldId: string,
    optionId: string,
  ): Promise<void> {
    const draft = await this.draft(userId, experienceId);
    await this.field(draft.id, experienceId, fieldId);
    const result = await this.database.client.fieldOption.deleteMany({
      where: {
        id: optionId,
        fieldDefinitionId: fieldId,
        revisionId: draft.id,
        experienceId,
      },
    });
    if (result.count !== 1) throw new NotFoundException('Resource not found.');
  }
  private async draft(userId: string, experienceId: string) {
    const experience = await this.access.requireExperience(
      userId,
      experienceId,
      true,
    );
    const drafts = await this.database.client.experienceRevision.findMany({
      where: {
        organizationId: experience.organizationId,
        experienceId,
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
  private async field(
    revisionId: string,
    experienceId: string,
    fieldId: string,
  ) {
    const field = await this.database.client.fieldDefinition.findFirst({
      where: { id: fieldId, revisionId, experienceId },
      select: {
        id: true,
        type: true,
        validation: true,
        options: { select: { id: true } },
      },
    });
    if (!field) throw new NotFoundException('Resource not found.');
    return field;
  }
  private rethrowConflict(error: unknown, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ['P2002', 'P2003'].includes(String(error.code))
    )
      throw new ConflictException(message);
    throw error;
  }
}
