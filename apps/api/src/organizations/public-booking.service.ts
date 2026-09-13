import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '@bizzres/database';
import type { CreateReservationDto } from './dto/booking.dto';
import { compareDecimal } from './field-validation';
import { SchedulingService } from './scheduling.service';
const revisionSelect = {
  version: true,
  name: true,
  description: true,
  cancellationTerms: true,
  priceAmount: true,
  currency: true,
  paymentMode: true,
  depositAmount: true,
  publishedAt: true,
  schedulingMode: true,
  durationMinutes: true,
  slotIntervalMinutes: true,
  bufferBeforeMinutes: true,
  bufferAfterMinutes: true,
  fields: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: {
      options: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      },
    },
  },
  pageBlocks: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, position: true, config: true },
  },
} satisfies Prisma.ExperienceRevisionSelect;
type PublishedRevision = Prisma.ExperienceRevisionGetPayload<{
  select: typeof revisionSelect;
}>;
type PublishedField = PublishedRevision['fields'][number];
type ValidationRules = {
  minLength?: number;
  maxLength?: number;
  minimum?: string;
  maximum?: string;
  decimalPlaces?: number;
};
@Injectable()
export class PublicBookingService {
  constructor(
    private db: DatabaseService,
    private scheduling: SchedulingService,
  ) {}
  async experience(b: string, e: string) {
    const x = await this.resolve(b, e);
    const revision = x.publishedRevision;
    return {
      business: x.business,
      experience: {
        id: x.id,
        slug: x.slug,
        acceptingReservations: x.acceptingReservations,
      },
      publishedRevision: this.revision(revision),
      fields: revision.fields.map(this.field),
      pageBlocks: revision.pageBlocks,
    };
  }
  async occurrences(b: string, e: string) {
    const x = await this.resolve(b, e);
    const now = new Date();
    const rows = await this.db.client.occurrence.findMany({
      where: { experienceId: x.id, startAt: { gt: now } },
      take: 100,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      include: {
        reservations: {
          where: { status: 'CONFIRMED' },
          select: { participantCount: true },
        },
      },
    });
    return {
      occurrences: rows.map((o) => {
        const reserved = o.reservations.reduce(
            (n, r) => n + r.participantCount,
            0,
          ),
          remaining = Math.max(o.capacity - reserved, 0);
        return {
          id: o.id,
          startAt: o.startAt,
          endAt: o.endAt,
          timezone: o.timezone,
          capacity: o.capacity,
          remainingCapacity: remaining,
          bookingClosesAt: o.bookingClosesAt,
          bookable:
            x.acceptingReservations &&
            !o.cancelledAt &&
            (!o.bookingClosesAt || now < o.bookingClosesAt) &&
            remaining > 0,
        };
      }),
    };
  }
  async reserve(
    b: string,
    e: string,
    input: CreateReservationDto,
    customerUserId?: string,
  ) {
    const resolved = await this.resolve(b, e);
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id"=${resolved.id}::uuid FOR UPDATE`;
      const x = await tx.experience.findFirst({
        where: {
          id: resolved.id,
          archivedAt: null,
          business: { archivedAt: null },
        },
        include: {
          business: { select: { name: true, slug: true, timezone: true } },
          publishedRevision: {
            include: {
              fields: {
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
                include: { options: true },
              },
            },
          },
        },
      });
      if (
        !x ||
        !x.acceptingReservations ||
        !x.publishedRevisionId ||
        !x.publishedRevision?.publishedAt
      )
        throw new ConflictException('Reservations are not open.');
      if (x.publishedRevision.paymentMode !== 'NONE')
        throw new ConflictException(
          'Online payment processing is not available yet for this payment mode.',
        );
      if (customerUserId) {
        const customer = await tx.user.findFirst({
          where: { id: customerUserId, disabledAt: null },
          select: { id: true },
        });
        if (!customer) throw new UnauthorizedException('Unauthorized.');
      }
      const explicit = input.booking.occurrenceId;
      const generated = input.booking.slot;
      if ((explicit ? 1 : 0) + (generated ? 1 : 0) !== 1)
        throw new BadRequestException(
          'Choose an occurrence or generated slot.',
        );
      let o;
      if (explicit) {
        if (x.publishedRevision.schedulingMode !== 'EXPLICIT_OCCURRENCES')
          throw new BadRequestException(
            'This Experience uses generated slots.',
          );
        await tx.$queryRaw`SELECT "id" FROM "Occurrence" WHERE "id"=${explicit}::uuid FOR UPDATE`;
        o = await tx.occurrence.findFirst({
          where: {
            id: explicit,
            organizationId: x.organizationId,
            experienceId: x.id,
          },
        });
      } else {
        if (input.booking.participantCount !== 1)
          throw new BadRequestException(
            'Generated slots require one participant.',
          );
        const slot = generated!;
        // Serialize all generated bookings for one Resource. This also protects
        // concurrent requests for different starts whose buffered occupancy overlaps.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${slot.resourceId}, 0))`;
        await tx.$queryRaw`SELECT "id" FROM "Resource" WHERE "id"=${slot.resourceId}::uuid FOR UPDATE`;
        const valid = await this.scheduling.requestedSlot(
          tx,
          x.id,
          slot.resourceId,
          slot.startAt,
        );
        const startAt = new Date(valid.startAt);
        const endAt = new Date(valid.endAt);
        const existing = await tx.occurrence.findFirst({
          where: {
            organizationId: x.organizationId,
            experienceId: x.id,
            resourceId: slot.resourceId,
            startAt,
            endAt,
          },
        });
        if (
          !existing &&
          (await tx.occurrence.count({
            where: {
              organizationId: x.organizationId,
              resourceId: slot.resourceId,
              startAt,
              endAt,
            },
          }))
        )
          throw new ConflictException(
            'This time is no longer available. Please choose another.',
          );
        if (existing) {
          await tx.$queryRaw`SELECT "id" FROM "Occurrence" WHERE "id"=${existing.id}::uuid FOR UPDATE`;
          if (existing.cancelledAt)
            throw new ConflictException('Occurrence is not bookable.');
          o = existing;
        } else
          o = await tx.occurrence.create({
            data: {
              organizationId: x.organizationId,
              businessId: x.businessId,
              experienceId: x.id,
              resourceId: slot.resourceId,
              startAt,
              endAt,
              timezone: valid.timezone,
              capacity: 1,
            },
          });
      }
      const now = new Date();
      if (
        !o ||
        o.cancelledAt ||
        o.startAt <= now ||
        (o.bookingClosesAt && now >= o.bookingClosesAt)
      )
        throw new ConflictException('Occurrence is not bookable.');
      const sum = await tx.reservation.aggregate({
        where: { occurrenceId: o.id, status: 'CONFIRMED' },
        _sum: { participantCount: true },
      });
      if (
        (sum._sum.participantCount ?? 0) + input.booking.participantCount >
        o.capacity
      )
        throw new ConflictException('Insufficient capacity.');
      const answers = this.answers(
        x.publishedRevision.fields,
        input.answers ?? {},
      );
      const r = await tx.reservation.create({
        data: {
          organizationId: x.organizationId,
          experienceId: x.id,
          revisionId: x.publishedRevisionId,
          occurrenceId: o.id,
          customerUserId,
          customerFullName: input.customer.fullName,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          startAt: o.startAt,
          endAt: o.endAt,
          timezone: o.timezone,
          participantCount: input.booking.participantCount,
          totalAmount: x.publishedRevision.priceAmount,
          currency: x.publishedRevision.currency,
          snapshotVersion: 1,
          experienceSnapshot: {
            business: { name: x.business.name, slug: x.business.slug },
            experience: {
              slug: x.slug,
              name: x.publishedRevision.name,
              revisionVersion: x.publishedRevision.version,
              cancellationTerms: x.publishedRevision.cancellationTerms,
              paymentMode: x.publishedRevision.paymentMode,
              depositAmount:
                x.publishedRevision.depositAmount?.toFixed(4) ?? null,
            },
          },
        },
        select: {
          id: true,
          status: true,
          customerFullName: true,
          startAt: true,
          endAt: true,
          timezone: true,
          participantCount: true,
          totalAmount: true,
          currency: true,
        },
      });
      for (const a of answers)
        await tx.reservationAnswer.create({
          data: {
            organizationId: x.organizationId,
            experienceId: x.id,
            revisionId: x.publishedRevisionId!,
            reservationId: r.id,
            fieldDefinitionId: a.fieldId,
            value: a.value as Prisma.InputJsonValue,
            snapshotVersion: 1,
            definitionSnapshot: a.snapshot as Prisma.InputJsonValue,
          },
        });
      await tx.reservationEvent.create({
        data: {
          organizationId: x.organizationId,
          reservationId: r.id,
          type: 'CREATED',
          actorKind: 'GUEST',
          payloadVersion: 1,
          payload: { channel: 'public_direct' },
        },
      });
      await tx.notification.create({
        data: {
          organizationId: x.organizationId,
          reservationId: r.id,
          type: 'BOOKING_CONFIRMATION',
          recipientEmail: input.customer.email,
          deduplicationKey: `reservation:${r.id}:confirmation`,
          payloadVersion: 1,
          payload: {
            reservationId: r.id,
            experienceName: x.publishedRevision.name,
            startAt: o.startAt.toISOString(),
            endAt: o.endAt.toISOString(),
            timezone: o.timezone,
          },
        },
      });
      return { reservation: { ...r, totalAmount: r.totalAmount.toFixed(4) } };
    });
  }
  private answers(fields: PublishedField[], given: Record<string, unknown>) {
    const known = new Set(fields.map((f) => f.key));
    if (Object.keys(given).some((k) => !known.has(k)))
      throw new BadRequestException('Unknown answer field.');
    return fields.flatMap((f) => {
      if (!(f.key in given)) {
        if (f.required)
          throw new BadRequestException(`Missing required field: ${f.key}`);
        return [];
      }
      const v = given[f.key];
      this.value(f, v);
      const keys = f.type === 'MULTISELECT' ? v : [v];
      const selected = ['SELECT', 'RADIO', 'MULTISELECT'].includes(f.type)
        ? (keys as string[]).map((k) => {
            const o = f.options.find((x) => x.key === k);
            if (!o) throw new BadRequestException('Invalid option.');
            return { key: o.key, label: o.label };
          })
        : undefined;
      return [
        {
          fieldId: f.id,
          value: v,
          snapshot: {
            key: f.key,
            label: f.label,
            type: f.type,
            ...(selected ? { selectedOptions: selected } : {}),
          },
        },
      ];
    });
  }
  private value(f: PublishedField, v: unknown) {
    const rules = (f.validation ?? {}) as ValidationRules;
    if (['TEXT', 'TEXTAREA'].includes(f.type)) {
      if (typeof v !== 'string' || (f.required && !v.trim()))
        throw new BadRequestException('Invalid text answer.');
      if (
        (rules.minLength !== undefined && v.length < rules.minLength) ||
        (rules.maxLength !== undefined && v.length > rules.maxLength)
      )
        throw new BadRequestException('Invalid text length.');
    } else if (f.type === 'NUMBER') {
      if (typeof v !== 'string' || !/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?)$/.test(v))
        throw new BadRequestException('Invalid number answer.');
      if (
        (rules.minimum !== undefined && compareDecimal(v, rules.minimum) < 0) ||
        (rules.maximum !== undefined && compareDecimal(v, rules.maximum) > 0) ||
        (rules.decimalPlaces !== undefined &&
          (v.split('.')[1]?.length ?? 0) > rules.decimalPlaces)
      )
        throw new BadRequestException('Number outside validation rules.');
    } else if (['SELECT', 'RADIO'].includes(f.type)) {
      if (typeof v !== 'string')
        throw new BadRequestException('Invalid option answer.');
    } else if (f.type === 'CHECKBOX') {
      if (typeof v !== 'boolean')
        throw new BadRequestException('Invalid checkbox answer.');
    } else if (f.type === 'MULTISELECT') {
      if (
        !Array.isArray(v) ||
        (f.required && !v.length) ||
        new Set(v).size !== v.length ||
        v.some((x) => typeof x !== 'string')
      )
        throw new BadRequestException('Invalid multiselect answer.');
    } else if (f.type === 'DATE') {
      if (
        typeof v !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v
      )
        throw new BadRequestException('Invalid date answer.');
    } else if (
      f.type === 'TIME' &&
      (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
    )
      throw new BadRequestException('Invalid time answer.');
  }
  private async resolve(b: string, e: string) {
    const x = await this.db.client.experience.findFirst({
      where: {
        slug: e,
        archivedAt: null,
        business: { slug: b, archivedAt: null },
        publishedRevisionId: { not: null },
      },
      select: {
        id: true,
        slug: true,
        acceptingReservations: true,
        business: {
          select: {
            name: true,
            slug: true,
            timezone: true,
            defaultCurrency: true,
          },
        },
        publishedRevision: { select: revisionSelect },
      },
    });
    if (!x || !x.publishedRevision?.publishedAt)
      throw new NotFoundException('Resource not found.');
    return { ...x, publishedRevision: x.publishedRevision };
  }
  private revision(r: PublishedRevision) {
    return {
      version: r.version,
      name: r.name,
      description: r.description,
      cancellationTerms: r.cancellationTerms,
      priceAmount: r.priceAmount.toFixed(4),
      currency: r.currency,
      paymentMode: r.paymentMode,
      depositAmount: r.depositAmount?.toFixed(4) ?? null,
      publishedAt: r.publishedAt,
      schedulingMode: r.schedulingMode,
      durationMinutes: r.durationMinutes,
      slotIntervalMinutes: r.slotIntervalMinutes,
      bufferBeforeMinutes: r.bufferBeforeMinutes,
      bufferAfterMinutes: r.bufferAfterMinutes,
    };
  }
  private field(f: PublishedField) {
    return {
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      position: f.position,
      placeholder: f.placeholder,
      helpText: f.helpText,
      validation: f.validation,
      options: f.options.map((o) => ({
        id: o.id,
        key: o.key,
        label: o.label,
        position: o.position,
      })),
    };
  }
}
