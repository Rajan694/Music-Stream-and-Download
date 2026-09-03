import { IsIn, IsOptional } from 'class-validator';
import type { AudioFormat, AudioQuality } from '@music/shared';

/** Every field is optional — PATCH updates only what it carries. */
export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['mp3', 'webm', 'ogg'])
  defaultFormat?: AudioFormat;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  defaultQuality?: AudioQuality;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  streamQuality?: AudioQuality;

  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';
}
