import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BusinessInputDto, trim } from './business.dto';

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  organizationName!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => BusinessInputDto)
  business!: BusinessInputDto;
}
