import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';

/** One played track. Every field is written to the database, so all of it is validated. */
export class RecentSongDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{11}$/, {
    message: 'videoId must be a valid video id',
  })
  videoId!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(200)
  uploaderName!: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(1000)
  thumbnailUrl?: string;

  // 24h ceiling: a bogus duration would otherwise drive UI layout and estimates.
  @IsInt()
  @Min(0)
  @Max(86_400)
  duration!: number;

  @IsISO8601()
  playedAt!: string;
}

export class SyncHistoryDto {
  @IsArray()
  // Guest history is capped at 100 client-side (§23); the server enforces its
  // own ceiling so one request cannot queue thousands of upserts.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RecentSongDto)
  items!: RecentSongDto[];
}
