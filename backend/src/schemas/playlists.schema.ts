import { z } from 'zod';

export const PinPlaylistSchema = z.object({
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{2,64}$/),
  title: z.string().max(300),
  thumbnailUrl: z.string().url().max(1000).optional(),
  videoCount: z.number().int().min(0).max(100_000).optional(),
});