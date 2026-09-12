import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { nullableTrim, trim } from './business.dto';
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
export class CreateOccurrenceDto {
  @IsString() @Matches(INSTANT) startAt!: string;
  @IsString() @Matches(INSTANT) endAt!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsInt() @Min(1) capacity!: number;
  @IsOptional() @IsString() @Matches(INSTANT) bookingClosesAt?: string | null;
}
export class UpdateOccurrenceDto {
  @IsOptional() @IsString() @Matches(INSTANT) startAt?: string;
  @IsOptional() @IsString() @Matches(INSTANT) endAt?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() @Matches(INSTANT) bookingClosesAt?: string | null;
}
class CustomerDto {
  @Transform(trim) @IsString() @MaxLength(200) @Matches(/\S/) fullName!: string;
  @Transform(trim) @IsString() @MaxLength(64) @Matches(/\S/) phone!: string;
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;
}
class GeneratedSlotDto {
  @IsUUID('4') resourceId!: string;
  @IsString() @Matches(INSTANT) startAt!: string;
}
class BookingDto {
  @IsOptional() @IsUUID('4') occurrenceId?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => GeneratedSlotDto)
  slot?: GeneratedSlotDto;
  @IsInt() @Min(1) participantCount!: number;
}
export class CreateReservationDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;
  @IsDefined() @ValidateNested() @Type(() => BookingDto) booking!: BookingDto;
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
}
export class CancelReservationDto {
  @Transform(nullableTrim) @IsOptional() @IsString() @MaxLength(1000) reason?:
    string | null;
}
