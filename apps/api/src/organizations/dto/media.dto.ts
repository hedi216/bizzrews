import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class SetLogoDto {
  @IsOptional() @IsUUID() mediaId!: string | null;
}

export class AttachPageBlockMediaDto {
  @IsUUID() mediaAssetId!: string;
  @IsInt() @Min(0) position!: number;
}

export class ReorderPageBlockMediaDto {
  @IsInt() @Min(0) position!: number;
}
