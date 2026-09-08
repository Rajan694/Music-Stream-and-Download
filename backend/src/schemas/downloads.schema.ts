import { z } from 'zod';

const FORMATS = ['mp3', 'webm', 'ogg'] as const;
const QUALITIES = ['low', 'medium', 'high'] as const;

export const CreateDownloadSchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  format: z.enum(FORMATS),
  quality: z.enum(QUALITIES),
});

export const EstimateDownloadSchema = z.object({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  format: z.enum(FORMATS).optional(),
  quality: z.enum(QUALITIES).optional(),
});

export const CreatePlaylistDownloadSchema = z.object({
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{2,64}$/),
  format: z.enum(FORMATS),
  quality: z.enum(QUALITIES),
});

export const EstimatePlaylistDownloadSchema = z.object({
  playlistId: z.string().regex(/^[A-Za-z0-9_-]{2,64}$/),
  format: z.enum(FORMATS).optional(),
  quality: z.enum(QUALITIES).optional(),
});