import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { basename } from 'node:path';
import { DatabaseService } from '../database/database.service';
import { OrganizationAccessService } from './organization-access.service';
import { MediaStorageService } from './media-storage.service';

export type UploadedImage = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const mediaSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
} as const;

@Injectable()
export class MediaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: OrganizationAccessService,
    private readonly storage: MediaStorageService,
  ) {}

  async upload(userId: string, businessId: string, file?: UploadedImage) {
    const business = await this.access.requireBusiness(
      userId,
      businessId,
      true,
    );
    if (!file) throw new BadRequestException('An image file is required.');
    if (
      !allowed.has(file.mimetype) ||
      !this.matches(file.mimetype, file.buffer)
    )
      throw new BadRequestException('Upload a JPEG, PNG, or WebP image.');
    if (file.size < 1 || file.size > 8 * 1024 * 1024)
      throw new BadRequestException('Image size must not exceed 8 MB.');
    const originalName = basename(file.originalname).slice(0, 255) || 'image';
    const storageKey = await this.storage.put(file.mimetype, file.buffer);
    try {
      return this.present(
        await this.db.client.mediaAsset.create({
          data: {
            organizationId: business.organizationId,
            businessId,
            originalName,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            storageKey,
          },
          select: mediaSelect,
        }),
      );
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async setLogo(userId: string, businessId: string, mediaId: string) {
    const business = await this.access.requireBusiness(
      userId,
      businessId,
      true,
    );
    const media = await this.db.client.mediaAsset.findFirst({
      where: {
        id: mediaId,
        organizationId: business.organizationId,
        businessId,
        archivedAt: null,
      },
      select: mediaSelect,
    });
    if (!media) throw new NotFoundException('Resource not found.');
    await this.db.client.business.update({
      where: { id: businessId },
      data: { logoMediaId: mediaId },
    });
    return this.present(media);
  }

  async publicFile(mediaId: string) {
    const media = await this.db.client.mediaAsset.findFirst({
      where: { id: mediaId, archivedAt: null },
      select: { storageKey: true, mimeType: true, originalName: true },
    });
    if (!media) throw new NotFoundException('Resource not found.');
    try {
      return { ...media, bytes: await this.storage.get(media.storageKey) };
    } catch {
      throw new NotFoundException('Resource not found.');
    }
  }

  present<
    T extends {
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    },
  >(media: T) {
    const base = (
      process.env.PUBLIC_API_URL ??
      `http://localhost:${process.env.API_PORT ?? '4000'}/api/v1`
    ).replace(/\/$/, '');
    return { ...media, url: `${base}/public/media/${media.id}` };
  }

  private matches(mime: string, bytes: Buffer) {
    if (mime === 'image/jpeg')
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    if (mime === 'image/png')
      return (
        bytes.length >= 8 &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      );
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
}
