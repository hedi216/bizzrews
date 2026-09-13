import { IsInt, IsUUID, Min } from 'class-validator';

export class SetLogoDto {
  @IsUUID() mediaId!: string;
}

export class AttachPageBlockMediaDto {
  @IsUUID() mediaAssetId!: string;
  @IsInt() @Min(0) position!: number;
}

export class ReorderPageBlockMediaDto {
  @IsInt() @Min(0) position!: number;
}
