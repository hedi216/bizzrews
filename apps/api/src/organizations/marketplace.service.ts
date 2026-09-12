import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MarketplaceService {
  constructor(private readonly db: DatabaseService) {}
  async search(raw?: string) {
    const query = raw?.trim() ?? '';
    if (query.length > 100)
      throw new BadRequestException('Search query is too long.');
    const businesses = await this.db.client.business.findMany({
      where: {
        archivedAt: null,
        marketplaceVisibility: 'LISTED',
        ...(query
          ? { name: { contains: query, mode: 'insensitive' as const } }
          : {}),
        experiences: {
          some: { archivedAt: null, publishedRevisionId: { not: null } },
        },
      },
      take: 50,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        name: true,
        slug: true,
        description: true,
        timezone: true,
        experiences: {
          where: { archivedAt: null, publishedRevisionId: { not: null } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            slug: true,
            acceptingReservations: true,
            publishedRevision: {
              select: {
                name: true,
                description: true,
                priceAmount: true,
                currency: true,
                paymentMode: true,
                depositAmount: true,
              },
            },
          },
        },
      },
    });
    return {
      businesses: businesses.map((b) => ({
        ...b,
        experiences: b.experiences
          .filter((e) => e.publishedRevision)
          .map((e) => ({
            ...e,
            publishedRevision: {
              ...e.publishedRevision!,
              priceAmount: e.publishedRevision!.priceAmount.toFixed(4),
              depositAmount:
                e.publishedRevision!.depositAmount?.toFixed(4) ?? null,
            },
          })),
      })),
    };
  }
}
