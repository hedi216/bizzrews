import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';
import {
  BUSINESS_SLUG_PATTERN,
  RESERVED_BUSINESS_SLUGS,
} from '../business-slug';

export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
export const nullableTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const result = value.trim();
  return result === '' ? null : result;
};
export const slugTransform = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
export const currencyTransform = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class BusinessInputDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Transform(slugTransform)
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

  @Transform(currencyTransform)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency!: string;
}

export class UpdateMarketplaceVisibilityDto {
  @IsIn(['UNLISTED', 'LISTED'])
  marketplaceVisibility!: 'UNLISTED' | 'LISTED';
}

export class UpdateBusinessDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
  @Transform(slugTransform)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(BUSINESS_SLUG_PATTERN)
  @IsNotIn([...RESERVED_BUSINESS_SLUGS], { message: 'slug is reserved' })
  slug?: string;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;
  @Transform(currencyTransform)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency?: string;
}
