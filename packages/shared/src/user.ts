import { z } from "zod";
import { AudioFormat, AudioQuality } from "./media.js";

export const UserSettingsSchema = z.object({
  defaultFormat: AudioFormat.default("mp3"),
  defaultQuality: AudioQuality.default("high"),
  streamQuality: AudioQuality.default("high"),
  theme: z.enum(["light", "dark", "system"]).default("system"),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const RecentSongSchema = z.object({
  videoId: z.string().min(1),
  title: z.string(),
  uploaderName: z.string(),
  thumbnailUrl: z.url().optional(),
  duration: z.number().int().nonnegative(),
  /** ISO 8601 timestamp */
  playedAt: z.string(),
});
export type RecentSong = z.infer<typeof RecentSongSchema>;

/** Error envelope returned by every failing API route. */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  statusCode: z.number().int(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
