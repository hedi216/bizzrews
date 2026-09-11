import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsNotIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  BUSINESS_SLUG_PATTERN,
  RESERVED_BUSINESS_SLUGS,
} from '../business-slug';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const nullableTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CreateBusinessDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(BUSINESS_SLUG_PATTERN)
  @IsNotIn([...RESERVED_BUSINESS_SLUGS], { message: 'slug is reserved' })
  slug!: string;

  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency!: string;
}

export class CreateOrganizationDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  organizationName!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateBusinessDto)
  business!: CreateBusinessDto;
}
