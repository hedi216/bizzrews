import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  async profile(userId: string, input: UpdateCustomerProfileDto) {
    const user = await this.db.client.user.findFirst({
      where: { id: userId, disabledAt: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Unauthorized.');
    return this.db.client.user.update({
      where: { id: userId },
      data: { displayName: input.displayName },
      select: { id: true, email: true, displayName: true },
    });
  }

  async reservations(userId: string) {
    const user = await this.db.client.user.findFirst({
      where: { id: userId, disabledAt: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Unauthorized.');
    const rows = await this.db.client.reservation.findMany({
      where: { customerUserId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        timezone: true,
        participantCount: true,
        totalAmount: true,
        currency: true,
        experienceSnapshot: true,
        createdAt: true,
      },
    });
    return {
      reservations: rows.map((row) => ({
        ...row,
        totalAmount: row.totalAmount.toFixed(4),
      })),
    };
  }

  async loyalty(userId: string) {
    const user = await this.db.client.user.findFirst({
      where: { id: userId, disabledAt: null },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('Unauthorized.');
    const accounts = await this.db.client.customerLoyaltyAccount.findMany({
      where: { userId, business: { archivedAt: null } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        balance: true,
        updatedAt: true,
        business: { select: { id: true, name: true, slug: true } },
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
    return { accounts };
  }
}
