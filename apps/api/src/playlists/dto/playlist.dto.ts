import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PinPlaylistDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,64}$/, {
    message: 'playlistId must be a valid playlist id',
  })
  playlistId!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(1000)
  thumbnailUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  videoCount?: number;
}
