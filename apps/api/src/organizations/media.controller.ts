import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { SetLogoDto } from './dto/media.dto';
import { MediaService, type UploadedImage } from './media.service';

@Controller({ version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('businesses/:businessId/media')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  upload(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @UploadedFile() file?: UploadedImage,
  ) {
    return this.media.upload(auth.sub, businessId, file);
  }

  @Patch('businesses/:businessId/logo')
  @UseGuards(AccessTokenGuard)
  setLogo(
    @CurrentAuth() auth: AccessTokenClaims,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() input: SetLogoDto,
  ) {
    return this.media.setLogo(auth.sub, businessId, input.mediaId);
  }

  @Get('public/media/:mediaId')
  @Header('Cache-Control', 'public, max-age=3600, immutable')
  async serve(@Param('mediaId', ParseUUIDPipe) mediaId: string) {
    const file = await this.media.publicFile(mediaId);
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      disposition: `inline; filename="${file.originalName.replace(/["\\]/g, '_')}"`,
    });
  }
}
