import { IsEnum, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { Optional, ValidateBoolean, ValidateUUID } from 'src/validation';

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AssetOrder } from 'src/enum';
import { TimeBucketSize } from 'src/repositories/asset.repository';

export class TimeBucketDto {
  @IsNotEmpty()
  @IsEnum(TimeBucketSize)
  @ApiProperty({ enum: TimeBucketSize, enumName: 'TimeBucketSize' })
  size!: TimeBucketSize;

  @ValidateUUID({ optional: true })
  userId?: string;

  @ValidateUUID({ optional: true })
  albumId?: string;

  @ValidateUUID({ optional: true })
  personId?: string;

  @ValidateUUID({ optional: true })
  tagId?: string;

  @ValidateBoolean({ optional: true })
  isArchived?: boolean;

  @ValidateBoolean({ optional: true })
  isFavorite?: boolean;

  @ValidateBoolean({ optional: true })
  isTrashed?: boolean;

  @ValidateBoolean({ optional: true })
  withStacked?: boolean;

  @ValidateBoolean({ optional: true })
  withPartners?: boolean;

  @IsEnum(AssetOrder)
  @Optional()
  @ApiProperty({ enum: AssetOrder, enumName: 'AssetOrder' })
  order?: AssetOrder;

  @Optional()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  @ApiProperty({ type: 'number', format: 'double' })
  x1?: number;

  @Optional()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  @ApiProperty({ type: 'number', format: 'double' })
  y1?: number;

  @Optional()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  @ApiProperty({ type: 'number', format: 'double' })
  x2?: number;

  @Optional()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  @ApiProperty({ type: 'number', format: 'double' })
  y2?: number;
}

export class TimeBucketAssetDto extends TimeBucketDto {
  @IsString()
  timeBucket!: string;
}

export class TimeBucketResponseDto {
  @ApiProperty({ type: 'string' })
  timeBucket!: string;

  @ApiProperty({ type: 'integer' })
  count!: number;
}
