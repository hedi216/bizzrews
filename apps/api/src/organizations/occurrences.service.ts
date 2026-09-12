import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@bizzres/database';
import { DatabaseService } from '../database/database.service';
import { OrganizationAccessService } from './organization-access.service';
import type {
  CreateOccurrenceDto,
  UpdateOccurrenceDto,
} from './dto/booking.dto';
const select = {
  id: true,
  experienceId: true,
  resourceId: true,
  startAt: true,
  endAt: true,
  timezone: true,
  capacity: true,
  bookingClosesAt: true,
  cancelledAt: true,
  reservations: {
    where: { status: 'CONFIRMED' as const },
    select: { participantCount: true },
  },
} satisfies Prisma.OccurrenceSelect;
type OccurrenceRow = Prisma.OccurrenceGetPayload<{ select: typeof select }>;
@Injectable()
export class OccurrencesService {
  constructor(
    private db: DatabaseService,
    private access: OrganizationAccessService,
  ) {}
  async create(u: string, e: string, i: CreateOccurrenceDto) {
    const x = await this.access.requireExperience(u, e, true);
    const b = await this.db.client.business.findUniqueOrThrow({
      where: { id: x.businessId },
      select: { timezone: true },
    });
    const data = this.values(i, b.timezone);
    return this.map(
      await this.db.client.occurrence.create({
        data: {
          organizationId: x.organizationId,
          businessId: x.businessId,
          experienceId: e,
          ...data,
        },
        select,
      }),
    );
  }
  async list(u: string, e: string) {
    await this.access.requireExperience(u, e);
    return {
      occurrences: (
        await this.db.client.occurrence.findMany({
          where: { experienceId: e },
          orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
          select,
        })
      ).map((x) => this.map(x)),
    };
  }
  async get(u: string, id: string) {
    const o = await this.find(u, id);
    return this.map(
      await this.db.client.occurrence.findUniqueOrThrow({
        where: { id: o.id },
        select,
      }),
    );
  }
  async update(u: string, id: string, i: UpdateOccurrenceDto) {
    if (Object.values(i).every((v) => v === undefined))
      throw new BadRequestException('At least one field is required.');
    await this.find(u, id, true);
    if (
      await this.db.client.reservation.count({
        where: { occurrenceId: id, status: 'CONFIRMED' },
      })
    )
      throw new ConflictException('Occurrence has confirmed reservations.');
    const current = await this.db.client.occurrence.findUniqueOrThrow({
      where: { id },
    });
    const data = this.values(
      {
        ...i,
        startAt: i.startAt ?? current.startAt.toISOString(),
        endAt: i.endAt ?? current.endAt.toISOString(),
        capacity: i.capacity ?? current.capacity,
      },
      i.timezone ?? current.timezone,
    );
    return this.map(
      await this.db.client.occurrence.update({ where: { id }, data, select }),
    );
  }
  async cancel(u: string, id: string) {
    const occurrence = await this.find(u, id, true);
    if (occurrence.cancelledAt) {
      return this.map(
        await this.db.client.occurrence.findUniqueOrThrow({
          where: { id },
          select,
        }),
      );
    }
    if (
      await this.db.client.reservation.count({
        where: { occurrenceId: id, status: 'CONFIRMED' },
      })
    )
      throw new ConflictException('Occurrence has confirmed reservations.');
    return this.map(
      await this.db.client.occurrence.update({
        where: { id },
        data: { cancelledAt: new Date() },
        select,
      }),
    );
  }
  private async find(u: string, id: string, w = false) {
    const o = await this.db.client.occurrence.findUnique({
      where: { id },
      select: { id: true, organizationId: true, cancelledAt: true },
    });
    if (!o) throw new NotFoundException('Resource not found.');
    const m = await this.access.requireOrganization(u, o.organizationId, w);
    if (w && m.role === 'STAFF') throw new ForbiddenException();
    return o;
  }
  private values(i: CreateOccurrenceDto, tz: string) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: i.timezone ?? tz });
    } catch {
      throw new BadRequestException('Invalid IANA timezone.');
    }
    const startAt = new Date(i.startAt),
      endAt = new Date(i.endAt),
      bookingClosesAt = i.bookingClosesAt ? new Date(i.bookingClosesAt) : null;
    if (
      !Number.isFinite(startAt.getTime()) ||
      !Number.isFinite(endAt.getTime()) ||
      (bookingClosesAt && !Number.isFinite(bookingClosesAt.getTime())) ||
      endAt <= startAt ||
      (bookingClosesAt && bookingClosesAt >= startAt)
    )
      throw new BadRequestException('Invalid occurrence interval.');
    return {
      startAt,
      endAt,
      timezone: i.timezone ?? tz,
      capacity: i.capacity,
      bookingClosesAt,
    };
  }
  private map({ reservations, ...o }: OccurrenceRow) {
    const reservedParticipants = reservations.reduce(
      (n, r) => n + r.participantCount,
      0,
    );
    return {
      ...o,
      reservedParticipants,
      remainingCapacity: Math.max(o.capacity - reservedParticipants, 0),
    };
  }
}
