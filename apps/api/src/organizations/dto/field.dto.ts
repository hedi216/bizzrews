import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { nullableTrim, trim } from './business.dto';

export const FIELD_KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'SELECT',
  'RADIO',
  'CHECKBOX',
  'MULTISELECT',
  'DATE',
  'TIME',
] as const;
export type FieldTypeValue = (typeof FIELD_TYPES)[number];
export const RESERVED_FIELD_KEYS = [
  'full_name',
  'email',
  'phone',
  'customer_full_name',
  'customer_email',
  'customer_phone',
  'occurrence',
  'occurrence_id',
  'participant_count',
  'start_at',
  'end_at',
  'timezone',
  'status',
  'price',
  'total_amount',
  'currency',
];
const keyTransform = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateFieldDto {
  @Transform(keyTransform)
  @IsString()
  @MaxLength(63)
  @Matches(FIELD_KEY)
  key!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsIn([...FIELD_TYPES]) type!: FieldTypeValue;
  @IsBoolean() required!: boolean;
  @IsInt() @Min(0) position!: number;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  placeholder?: string | null;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  helpText?: string | null;
  @IsOptional() @IsObject() validation?: Record<string, unknown> | null;
}
export class UpdateFieldDto {
  @Transform(keyTransform)
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Matches(FIELD_KEY)
  key?: string;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label?: string;
  @IsOptional() @IsIn([...FIELD_TYPES]) type?: FieldTypeValue;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  placeholder?: string | null;
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  helpText?: string | null;
  @IsOptional() @IsObject() validation?: Record<string, unknown> | null;
}
export class CreateOptionDto {
  @Transform(keyTransform)
  @IsString()
  @MaxLength(63)
  @Matches(FIELD_KEY)
  key!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsInt() @Min(0) position!: number;
}
export class UpdateOptionDto {
  @Transform(keyTransform)
  @IsOptional()
  @IsString()
  @MaxLength(63)
  @Matches(FIELD_KEY)
  key?: string;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
