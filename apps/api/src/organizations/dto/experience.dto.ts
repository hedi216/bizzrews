import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BUSINESS_SLUG_PATTERN } from '../business-slug';
import {
  currencyTransform,
  nullableTrim,
  slugTransform,
  trim,
} from './business.dto';

const MONEY = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/;

export class CreateExperienceDto {
  @Transform(slugTransform)
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(BUSINESS_SLUG_PATTERN)
  slug!: string;
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  cancellationTerms?: string | null;
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  priceAmount?: string;
  @Transform(currencyTransform)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class UpdateDraftDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  cancellationTerms?: string | null;
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  priceAmount?: string;
  @Transform(currencyTransform)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class UpdateExperienceDto {
  @Transform(slugTransform)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Matches(BUSINESS_SLUG_PATTERN)
  slug?: string;
}
