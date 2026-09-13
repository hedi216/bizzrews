import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  Put,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CreatePageBlockDto, UpdatePageBlockDto } from './dto/page-block.dto';
import { PageBlocksService } from './page-blocks.service';
import {
  AttachPageBlockMediaDto,
  ReorderPageBlockMediaDto,
} from './dto/media.dto';

@Controller({
  path: 'experiences/:experienceId/draft/page-blocks',
  version: '1',
})
@UseGuards(AccessTokenGuard)
export class PageBlocksController {
  constructor(private readonly blocks: PageBlocksService) {}
  @Post() create(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Body() body: CreatePageBlockDto,
  ) {
    return this.blocks.create(a.sub, e, body);
  }
  @Patch(':blockId') update(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('blockId', ParseUUIDPipe) id: string,
    @Body() body: UpdatePageBlockDto,
  ) {
    return this.blocks.update(a.sub, e, id, body);
  }
  @Delete(':blockId') @HttpCode(204) remove(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('blockId', ParseUUIDPipe) id: string,
  ) {
    return this.blocks.remove(a.sub, e, id);
  }
  @Post(':blockId/media') attachMedia(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body() body: AttachPageBlockMediaDto,
  ) {
    return this.blocks.attachMedia(a.sub, e, blockId, body);
  }
  @Put(':blockId/media/:mediaId') reorderMedia(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body() body: ReorderPageBlockMediaDto,
  ) {
    return this.blocks.reorderMedia(a.sub, e, blockId, mediaId, body);
  }
  @Delete(':blockId/media/:mediaId') @HttpCode(204) removeMedia(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.blocks.removeMedia(a.sub, e, blockId, mediaId);
  }
}
