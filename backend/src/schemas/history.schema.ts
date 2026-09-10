import { z } from 'zod';

export const RecentSongSchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().max(300),
  uploaderName: z.string().max(200),
  thumbnailUrl: z.string().url().max(1000).optional(),
  duration: z.number().int().min(0).max(86_400),
  playedAt: z.string().datetime(),
});

export const SyncHistorySchema = z.object({
  items: z.array(RecentSongSchema).max(200),
});

export const PlayEventInputSchema = z.object({
  id: z.string().uuid(),
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().max(300),
  uploaderName: z.string().max(200),
  durationSec: z.number().int().min(0).max(86_400),
  msPlayed: z.number().int().min(0),
  completed: z.boolean().default(false),
  source: z.string().max(50).default('stream'),
  clientPlatform: z.string().max(50).default('unknown'),
  playedAt: z.string().datetime(),
});

export const BatchPlayEventsSchema = z.object({
  events: z.array(PlayEventInputSchema).max(200),
});

export type PlayEventInput = z.infer<typeof PlayEventInputSchema>;