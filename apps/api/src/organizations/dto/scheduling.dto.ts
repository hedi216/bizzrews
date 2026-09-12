import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trim } from './business.dto';

export const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export class CreateResourceDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
}
export class UpdateResourceDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class WeeklyWindowDto {
  @IsEnum(DAYS) dayOfWeek!: (typeof DAYS)[number];
  @IsString() @Matches(LOCAL_TIME) start!: string;
  @IsString() @Matches(LOCAL_TIME) end!: string;
}
export class ReplaceWeeklyAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows!: WeeklyWindowDto[];
}
export class AvailabilityOverrideDto {
  @IsBoolean() available!: boolean;
  @ValidateIf((o: AvailabilityOverrideDto) => o.available)
  @IsString()
  @Matches(LOCAL_TIME)
  start?: string;
  @ValidateIf((o: AvailabilityOverrideDto) => o.available)
  @IsString()
  @Matches(LOCAL_TIME)
  end?: string;
}
