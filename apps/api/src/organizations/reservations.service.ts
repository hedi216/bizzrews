import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '@bizzres/database';
import { OrganizationAccessService } from './organization-access.service';
import type { CancelReservationDto } from './dto/booking.dto';
const select = {
  id: true,
  status: true,
  customerFullName: true,
  customerPhone: true,
  customerEmail: true,
  startAt: true,
  endAt: true,
  timezone: true,
  participantCount: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  answers: {
    orderBy: { createdAt: 'asc' as const },
    select: { value: true, definitionSnapshot: true },
  },
} satisfies Prisma.ReservationSelect;
type ReservationRow = Prisma.ReservationGetPayload<{ select: typeof select }>;
@Injectable()
export class ReservationsService {
  constructor(
    private db: DatabaseService,
    private access: OrganizationAccessService,
  ) {}
  async list(u: string, e: string) {
    await this.access.requireExperience(u, e);
    return {
      reservations: (
        await this.db.client.reservation.findMany({
          where: { experienceId: e },
          take: 100,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select,
        })
      ).map(this.map),
    };
  }
  async get(u: string, id: string) {
    const r = await this.find(u, id);
    return this.map(
      await this.db.client.reservation.findUniqueOrThrow({
        where: { id: r.id },
        select,
      }),
    );
  }
  async cancel(u: string, id: string, input: CancelReservationDto) {
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Reservation" WHERE "id"=${id}::uuid FOR UPDATE`;
      const r = await tx.reservation.findUnique({
        where: { id },
        select: { id: true, organizationId: true, status: true },
      });
      if (!r) throw new NotFoundException('Resource not found.');
      const m = await tx.organizationMember.findFirst({
        where: { organizationId: r.organizationId, userId: u, active: true },
        select: { id: true, role: true },
      });
      if (!m) throw new NotFoundException('Resource not found.');
      if (m.role === 'STAFF') throw new ForbiddenException();
      if (r.status === 'CANCELLED')
        throw new ConflictException('Reservation is already cancelled.');
      const now = new Date();
      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationReason: input.reason ?? null,
        },
        select,
      });
      await tx.reservationEvent.create({
        data: {
          organizationId: r.organizationId,
          reservationId: id,
          type: 'CANCELLED',
          actorKind: 'MEMBER',
          actorMemberId: m.id,
          payloadVersion: 1,
          payload: input.reason ? { reason: input.reason } : {},
        },
      });
      return this.map(updated);
    });
  }
  private async find(u: string, id: string) {
    const r = await this.db.client.reservation.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!r) throw new NotFoundException('Resource not found.');
    await this.access.requireOrganization(u, r.organizationId);
    return r;
  }
  private map(r: ReservationRow) {
    return { ...r, totalAmount: r.totalAmount.toFixed(4) };
  }
}
