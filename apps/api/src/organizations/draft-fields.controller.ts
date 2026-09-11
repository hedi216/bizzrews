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
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard';
import type { AccessTokenClaims } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { DraftFieldsService } from './draft-fields.service';
import {
  CreateFieldDto,
  CreateOptionDto,
  UpdateFieldDto,
  UpdateOptionDto,
} from './dto/field.dto';

@Controller({ path: 'experiences/:experienceId/draft/fields', version: '1' })
@UseGuards(AccessTokenGuard)
export class DraftFieldsController {
  constructor(private readonly fields: DraftFieldsService) {}
  @Post() createField(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Body() body: CreateFieldDto,
  ) {
    return this.fields.createField(a.sub, e, body);
  }
  @Patch(':fieldId') updateField(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('fieldId', ParseUUIDPipe) f: string,
    @Body() body: UpdateFieldDto,
  ) {
    return this.fields.updateField(a.sub, e, f, body);
  }
  @Delete(':fieldId') @HttpCode(204) deleteField(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('fieldId', ParseUUIDPipe) f: string,
  ) {
    return this.fields.deleteField(a.sub, e, f);
  }
  @Post(':fieldId/options') createOption(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('fieldId', ParseUUIDPipe) f: string,
    @Body() body: CreateOptionDto,
  ) {
    return this.fields.createOption(a.sub, e, f, body);
  }
  @Patch(':fieldId/options/:optionId') updateOption(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('fieldId', ParseUUIDPipe) f: string,
    @Param('optionId', ParseUUIDPipe) o: string,
    @Body() body: UpdateOptionDto,
  ) {
    return this.fields.updateOption(a.sub, e, f, o, body);
  }
  @Delete(':fieldId/options/:optionId') @HttpCode(204) deleteOption(
    @CurrentAuth() a: AccessTokenClaims,
    @Param('experienceId', ParseUUIDPipe) e: string,
    @Param('fieldId', ParseUUIDPipe) f: string,
    @Param('optionId', ParseUUIDPipe) o: string,
  ) {
    return this.fields.deleteOption(a.sub, e, f, o);
  }
}
