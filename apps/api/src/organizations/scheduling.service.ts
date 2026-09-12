import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@bizzres/database';
import { DateTime } from 'luxon';
import { DatabaseService } from '../database/database.service';
import { timeText, validateDate, zonedInstant } from './scheduling-time';

const dayNames = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
type Slot = {
  resource: { id: string; name: string };
  startAt: string;
  endAt: string;
  localStart: string;
  localEnd: string;
  bookable: true;
};

@Injectable()
export class SchedulingService {
  constructor(private db: DatabaseService) {}

  async publicSlots(
    businessSlug: string,
    experienceSlug: string,
    date: string,
    resourceId?: string,
  ) {
    validateDate(date);
    return this.db.client.$transaction(async (tx) => {
      const experience = await tx.experience.findFirst({
        where: {
          slug: experienceSlug,
          archivedAt: null,
          business: { slug: businessSlug, archivedAt: null },
          publishedRevisionId: { not: null },
        },
        select: {
          id: true,
          acceptingReservations: true,
          business: { select: { timezone: true } },
          publishedRevision: {
            select: {
              publishedAt: true,
              schedulingMode: true,
              durationMinutes: true,
              slotIntervalMinutes: true,
              bufferBeforeMinutes: true,
              bufferAfterMinutes: true,
            },
          },
        },
      });
      if (!experience?.publishedRevision?.publishedAt)
        throw new NotFoundException('Resource not found.');
      if (experience.publishedRevision.schedulingMode !== 'GENERATED_SLOTS')
        throw new BadRequestException(
          'Use the occurrences endpoint for this Experience.',
        );
      const slots = await this.calculate(
        tx,
        experience.id,
        experience.business.timezone,
        date,
        experience.publishedRevision,
        resourceId,
      );
      return {
        date,
        timezone: experience.business.timezone,
        slots: experience.acceptingReservations
          ? slots
          : slots.map((x) => ({ ...x, bookable: false })),
      };
    });
  }

  async requestedSlot(
    tx: Prisma.TransactionClient,
    experienceId: string,
    resourceId: string,
    startAt: string,
  ) {
    const experience = await tx.experience.findUniqueOrThrow({
      where: { id: experienceId },
      select: {
        business: { select: { timezone: true } },
        publishedRevision: {
          select: {
            schedulingMode: true,
            durationMinutes: true,
            slotIntervalMinutes: true,
            bufferBeforeMinutes: true,
            bufferAfterMinutes: true,
          },
        },
      },
    });
    const revision = experience.publishedRevision;
    if (!revision || revision.schedulingMode !== 'GENERATED_SLOTS')
      throw new BadRequestException('Invalid generated slot request.');
    const requested = DateTime.fromISO(startAt, { setZone: true });
    if (!requested.isValid)
      throw new BadRequestException('Invalid slot instant.');
    const localDate = requested
      .setZone(experience.business.timezone)
      .toISODate();
    if (!localDate) throw new BadRequestException('Invalid slot instant.');
    const slots = await this.calculate(
      tx,
      experienceId,
      experience.business.timezone,
      localDate,
      revision,
      resourceId,
    );
    const exact = slots.find(
      (x) =>
        x.resource.id === resourceId && x.startAt === requested.toUTC().toISO(),
    );
    if (!exact) throw new BadRequestException('Slot is no longer available.');
    return {
      ...exact,
      timezone: experience.business.timezone,
      bufferBeforeMinutes: revision.bufferBeforeMinutes,
      bufferAfterMinutes: revision.bufferAfterMinutes,
    };
  }

  private async calculate(
    tx: Prisma.TransactionClient,
    experienceId: string,
    zone: string,
    date: string,
    revision: {
      durationMinutes: number | null;
      slotIntervalMinutes: number | null;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
    },
    resourceId?: string,
  ): Promise<Slot[]> {
    const duration = revision.durationMinutes!,
      interval = revision.slotIntervalMinutes!;
    const localDay = DateTime.fromISO(date, { zone });
    const resources = await tx.experienceResource.findMany({
      where: {
        experienceId,
        active: true,
        resource: { active: true },
        ...(resourceId ? { resourceId } : {}),
      },
      include: {
        resource: {
          include: {
            weeklyAvailability: {
              where: { dayOfWeek: dayNames[localDay.weekday - 1] },
            },
            availabilityOverrides: {
              where: { date: new Date(`${date}T00:00:00.000Z`) },
            },
          },
        },
      },
      orderBy: [{ resource: { name: 'asc' } }, { resourceId: 'asc' }],
    });
    if (resourceId && resources.length === 0)
      throw new BadRequestException('Resource is not active and assigned.');
    const now = DateTime.utc();
    const result: Slot[] = [];
    for (const assignment of resources) {
      const override = assignment.resource.availabilityOverrides[0];
      const windows = override
        ? override.available && override.startLocalTime && override.endLocalTime
          ? [
              {
                startLocalTime: override.startLocalTime,
                endLocalTime: override.endLocalTime,
              },
            ]
          : []
        : assignment.resource.weeklyAvailability;
      const dayStart = zonedInstant(date, '00:00', zone)
        .minus({ days: 1 })
        .toUTC()
        .toJSDate();
      const dayEnd = zonedInstant(date, '00:00', zone)
        .plus({ days: 2 })
        .toUTC()
        .toJSDate();
      const reservations = await tx.reservation.findMany({
        where: {
          status: 'CONFIRMED',
          occurrence: {
            resourceId: assignment.resourceId,
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
        },
        select: {
          startAt: true,
          endAt: true,
          revision: {
            select: { bufferBeforeMinutes: true, bufferAfterMinutes: true },
          },
        },
      });
      for (const window of windows) {
        const ws = timeText(window.startLocalTime),
          we = timeText(window.endLocalTime);
        let cursor = zonedInstant(date, ws, zone);
        const windowStart = cursor,
          windowEnd = zonedInstant(date, we, zone);
        while (cursor.plus({ minutes: duration }) <= windowEnd) {
          const serviceEnd = cursor.plus({ minutes: duration });
          const occupiedStart = cursor.minus({
            minutes: revision.bufferBeforeMinutes,
          });
          const occupiedEnd = serviceEnd.plus({
            minutes: revision.bufferAfterMinutes,
          });
          const busy = reservations.some((r) => {
            const oldStart = DateTime.fromJSDate(r.startAt).minus({
              minutes: r.revision.bufferBeforeMinutes,
            });
            const oldEnd = DateTime.fromJSDate(r.endAt).plus({
              minutes: r.revision.bufferAfterMinutes,
            });
            return occupiedStart < oldEnd && occupiedEnd > oldStart;
          });
          if (
            occupiedStart >= windowStart &&
            occupiedEnd <= windowEnd &&
            cursor.toUTC() > now &&
            !busy
          )
            result.push({
              resource: {
                id: assignment.resource.id,
                name: assignment.resource.name,
              },
              startAt: cursor.toUTC().toISO()!,
              endAt: serviceEnd.toUTC().toISO()!,
              localStart: cursor.toFormat('HH:mm'),
              localEnd: serviceEnd.toFormat('HH:mm'),
              bookable: true,
            });
          cursor = cursor.plus({ minutes: interval });
        }
      }
    }
    return result.sort(
      (a, b) =>
        a.startAt.localeCompare(b.startAt) ||
        a.resource.id.localeCompare(b.resource.id),
    );
  }
}
