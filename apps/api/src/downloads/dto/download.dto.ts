import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { AudioFormat, AudioQuality } from '@music/shared';

const FORMATS = ['mp3', 'webm', 'ogg'] as const;
const QUALITIES = ['low', 'medium', 'high'] as const;

/**
 * These are classes, not inline object types: `ValidationPipe` reads
 * `class-validator` metadata off the parameter's design type, so a plain type
 * annotation is erased at runtime and nothing gets validated.
 */
export class CreateDownloadDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{11}$/, {
    message: 'videoId must be a valid video id',
  })
  videoId!: string;

  @IsIn(FORMATS)
  format!: AudioFormat;

  @IsIn(QUALITIES)
  quality!: AudioQuality;
}

export class EstimateDownloadDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{11}$/, {
    message: 'videoId must be a valid video id',
  })
  videoId!: string;

  @IsOptional()
  @IsIn(FORMATS)
  format?: AudioFormat;

  @IsOptional()
  @IsIn(QUALITIES)
  quality?: AudioQuality;
}
