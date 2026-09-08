import { z } from 'zod';
import { AudioFormat, AudioQuality } from '@music/shared';

export const UpdateSettingsSchema = z.object({
  defaultFormat: AudioFormat.optional(),
  defaultQuality: AudioQuality.optional(),
  streamQuality: AudioQuality.optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});