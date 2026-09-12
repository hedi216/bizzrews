import { IsIn, IsInt, IsObject, IsOptional, Min } from 'class-validator';

export const PAGE_BLOCK_TYPES = [
  'HERO',
  'TEXT',
  'GALLERY',
  'LOCATION',
  'ITINERARY',
  'FORM',
  'CTA',
] as const;
export type PageBlockTypeValue = (typeof PAGE_BLOCK_TYPES)[number];

export class CreatePageBlockDto {
  @IsIn([...PAGE_BLOCK_TYPES]) type!: PageBlockTypeValue;
  @IsInt() @Min(0) position!: number;
  @IsObject() config!: Record<string, unknown>;
}
export class UpdatePageBlockDto {
  @IsOptional() @IsIn([...PAGE_BLOCK_TYPES]) type?: PageBlockTypeValue;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
