import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@bizzres/database';
import { DatabaseService } from '../database/database.service';
import { OrganizationAccessService } from './organization-access.service';
import type {
  AvailabilityOverrideDto,
  CreateResourceDto,
  ReplaceWeeklyAvailabilityDto,
  UpdateResourceDto,
} from './dto/scheduling.dto';
import {
  dateText,
  dateValue,
  timeText,
  timeValue,
  validateDate,
  validateWindow,
} from './scheduling-time';

@Injectable()
export class ResourcesService {
  constructor(
    private db: DatabaseService,
    private access: OrganizationAccessService,
  ) {}
  async create(user: string, businessId: string, input: CreateResourceDto) {
    const b = await this.access.requireBusiness(user, businessId, true);
    return this.view(
      await this.db.client.resource.create({
        data: {
          organizationId: b.organizationId,
          businessId,
          name: input.name,
        },
      }),
    );
  }
  async list(user: string, businessId: string) {
    await this.access.requireBusiness(user, businessId);
    return {
      resources: (
        await this.db.client.resource.findMany({
          where: { businessId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      ).map((x) => this.view(x)),
    };
  }
  async update(user: string, id: string, input: UpdateResourceDto) {
    if (Object.values(input).every((x) => x === undefined))
      throw new BadRequestException('At least one field is required.');
    const r = await this.resource(user, id, true);
    return this.view(
      await this.db.client.resource.update({
        where: { id: r.id },
        data: input,
      }),
    );
  }
  async assign(user: string, experienceId: string, resourceId: string) {
    const e = await this.access.requireExperience(user, experienceId, true);
    const r = await this.db.client.resource.findFirst({
      where: {
        id: resourceId,
        organizationId: e.organizationId,
        businessId: e.businessId,
      },
    });
    if (!r)
      throw new BadRequestException(
        'Resource must belong to the same Business.',
      );
    try {
      const assignment = await this.db.client.experienceResource.create({
        data: {
          organizationId: e.organizationId,
          businessId: e.businessId,
          experienceId,
          resourceId,
        },
        include: { resource: true },
      });
      return {
        active: assignment.active,
        resource: this.view(assignment.resource),
      };
    } catch (error) {
      this.conflict(error, 'Resource is already assigned.');
    }
  }
  async unassign(user: string, experienceId: string, resourceId: string) {
    const e = await this.access.requireExperience(user, experienceId, true);
    const result = await this.db.client.experienceResource.deleteMany({
      where: { organizationId: e.organizationId, experienceId, resourceId },
    });
    if (!result.count) throw new NotFoundException('Resource not found.');
  }
  async assignments(user: string, experienceId: string) {
    await this.access.requireExperience(user, experienceId);
    const rows = await this.db.client.experienceResource.findMany({
      where: { experienceId },
      include: { resource: true },
      orderBy: [{ createdAt: 'asc' }, { resourceId: 'asc' }],
    });
    return {
      resources: rows.map((x) => ({
        ...this.view(x.resource),
        assignmentActive: x.active,
      })),
    };
  }
  async replaceWeekly(
    user: string,
    id: string,
    input: ReplaceWeeklyAvailabilityDto,
  ) {
    const r = await this.resource(user, id, true);
    const grouped = new Map<string, Array<{ start: string; end: string }>>();
    for (const w of input.windows) {
      validateWindow(w.start, w.end);
      const same = grouped.get(w.dayOfWeek) ?? [];
      if (same.some((x) => w.start < x.end && w.end > x.start))
        throw new BadRequestException('Availability windows overlap.');
      same.push(w);
      grouped.set(w.dayOfWeek, same);
    }
    await this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Resource" WHERE "id"=${id}::uuid FOR UPDATE`;
      await tx.resourceWeeklyAvailability.deleteMany({
        where: { resourceId: id },
      });
      if (input.windows.length)
        await tx.resourceWeeklyAvailability.createMany({
          data: input.windows.map((w) => ({
            organizationId: r.organizationId,
            businessId: r.businessId,
            resourceId: id,
            dayOfWeek: w.dayOfWeek,
            startLocalTime: timeValue(w.start),
            endLocalTime: timeValue(w.end),
          })),
        });
    });
    return this.weekly(user, id);
  }
  async weekly(user: string, id: string) {
    await this.resource(user, id);
    const rows = await this.db.client.resourceWeeklyAvailability.findMany({
      where: { resourceId: id },
      orderBy: [{ dayOfWeek: 'asc' }, { startLocalTime: 'asc' }, { id: 'asc' }],
    });
    return {
      windows: rows.map((x) => ({
        id: x.id,
        dayOfWeek: x.dayOfWeek,
        start: timeText(x.startLocalTime),
        end: timeText(x.endLocalTime),
      })),
    };
  }
  async putOverride(
    user: string,
    id: string,
    date: string,
    input: AvailabilityOverrideDto,
  ) {
    const r = await this.resource(user, id, true);
    validateDate(date);
    if (input.available) validateWindow(input.start, input.end);
    else if (input.start !== undefined || input.end !== undefined)
      throw new BadRequestException(
        'Unavailable override cannot contain a window.',
      );
    const value = await this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Resource" WHERE "id"=${id}::uuid FOR UPDATE`;
      return tx.resourceAvailabilityOverride.upsert({
        where: {
          organizationId_resourceId_date: {
            organizationId: r.organizationId,
            resourceId: id,
            date: dateValue(date),
          },
        },
        create: {
          organizationId: r.organizationId,
          businessId: r.businessId,
          resourceId: id,
          date: dateValue(date),
          available: input.available,
          startLocalTime: input.available ? timeValue(input.start!) : null,
          endLocalTime: input.available ? timeValue(input.end!) : null,
        },
        update: {
          available: input.available,
          startLocalTime: input.available ? timeValue(input.start!) : null,
          endLocalTime: input.available ? timeValue(input.end!) : null,
        },
      });
    });
    return {
      id: value.id,
      date: dateText(value.date),
      available: value.available,
      start: value.startLocalTime ? timeText(value.startLocalTime) : null,
      end: value.endLocalTime ? timeText(value.endLocalTime) : null,
    };
  }
  async overrides(user: string, id: string) {
    await this.resource(user, id);
    const rows = await this.db.client.resourceAvailabilityOverride.findMany({
      where: { resourceId: id },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    return {
      overrides: rows.map((x) => ({
        id: x.id,
        date: dateText(x.date),
        available: x.available,
        start: x.startLocalTime ? timeText(x.startLocalTime) : null,
        end: x.endLocalTime ? timeText(x.endLocalTime) : null,
      })),
    };
  }
  async deleteOverride(user: string, id: string, date: string) {
    const r = await this.resource(user, id, true);
    validateDate(date);
    const result = await this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Resource" WHERE "id"=${id}::uuid FOR UPDATE`;
      return tx.resourceAvailabilityOverride.deleteMany({
        where: {
          organizationId: r.organizationId,
          resourceId: id,
          date: dateValue(date),
        },
      });
    });
    if (!result.count) throw new NotFoundException('Resource not found.');
  }
  private async resource(user: string, id: string, write = false) {
    const r = await this.db.client.resource.findUnique({
      where: { id },
      select: { id: true, organizationId: true, businessId: true },
    });
    if (!r) throw new NotFoundException('Resource not found.');
    await this.access.requireOrganization(user, r.organizationId, write);
    return r;
  }
  private conflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(message);
    throw error;
  }
  private view<
    T extends {
      id: string;
      businessId: string;
      name: string;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
  >(value: T) {
    return {
      id: value.id,
      businessId: value.businessId,
      name: value.name,
      active: value.active,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }
}
