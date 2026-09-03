import { z } from "zod";

// ─── Quality & Format ─────────────────────────────────────────────────────────

export const AudioQuality = z.enum(["low", "medium", "high"]);
export type AudioQuality = z.infer<typeof AudioQuality>;

export const AudioFormat = z.enum(["mp3", "webm", "ogg"]);
export type AudioFormat = z.infer<typeof AudioFormat>;

// ─── Primitives ───────────────────────────────────────────────────────────────

export const ThumbnailSchema = z.object({
  url: z.url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type Thumbnail = z.infer<typeof ThumbnailSchema>;

export const AudioStreamSchema = z.object({
  url: z.url(),
  mimeType: z.string(),
  /** bits per second */
  bitrate: z.number().positive().optional(),
  contentLength: z.number().positive().optional(),
  codec: z.string().optional(),
});
export type AudioStream = z.infer<typeof AudioStreamSchema>;

// This is an audio product: video streams are deliberately not modelled.
// Carrying them meant every provider mapped, validated, cached and shipped
// ~37 muxed formats per track — 77% of the video payload — that no caller ever
// read. Playback and downloads both resolve from `audioStreams`.

// ─── Video ────────────────────────────────────────────────────────────────────

/** Lightweight video shape used in lists: search results, related, playlists. */
export const VideoSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  uploaderName: z.string(),
  uploaderId: z.string().optional(),
  /** seconds */
  duration: z.number().int().nonnegative(),
  thumbnails: z.array(ThumbnailSchema),
  viewCount: z.number().int().nonnegative().optional(),
  uploadDate: z.string().optional(),
});
export type VideoSummary = z.infer<typeof VideoSummarySchema>;

export const VideoSchema = VideoSummarySchema.extend({
  description: z.string().optional(),
  likeCount: z.number().int().nonnegative().optional(),
  audioStreams: z.array(AudioStreamSchema).default([]),
  relatedVideos: z.array(VideoSummarySchema).default([]),
});
export type Video = z.infer<typeof VideoSchema>;

// ─── Playlist ─────────────────────────────────────────────────────────────────

export const PlaylistItemSchema = VideoSummarySchema;
export type PlaylistItem = z.infer<typeof PlaylistItemSchema>;

export const PlaylistSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  uploaderName: z.string(),
  uploaderId: z.string().optional(),
  videoCount: z.number().int().nonnegative(),
  thumbnails: z.array(ThumbnailSchema),
  description: z.string().optional(),
  videos: z.array(PlaylistItemSchema),
  nextPage: z.string().nullable().optional(),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

// ─── Search ───────────────────────────────────────────────────────────────────

export const SearchVideoItemSchema = VideoSummarySchema.extend({
  type: z.literal("video"),
});

export const SearchPlaylistItemSchema = z.object({
  type: z.literal("playlist"),
  id: z.string().min(1),
  title: z.string(),
  uploaderName: z.string(),
  videoCount: z.number().int().nonnegative(),
  thumbnails: z.array(ThumbnailSchema),
});

export const SearchItemSchema = z.discriminatedUnion("type", [
  SearchVideoItemSchema,
  SearchPlaylistItemSchema,
]);
export type SearchItem = z.infer<typeof SearchItemSchema>;

export const SearchResultSchema = z.object({
  items: z.array(SearchItemSchema),
  nextPage: z.string().nullable().optional(),
  suggestion: z.string().nullable().optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Response of `GET /search`. The backend decides whether the raw input was a
 * search phrase or a direct video/playlist link (§10), so the shape is a
 * discriminated union rather than a bare result list.
 */
export const SearchResponseSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("search"), data: SearchResultSchema }),
  z.object({ intent: z.literal("video"), id: z.string().min(1) }),
  z.object({ intent: z.literal("playlist"), id: z.string().min(1) }),
]);
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ─── Download jobs ────────────────────────────────────────────────────────────

export const JobState = z.enum([
  "queued",
  "resolving",
  "downloading",
  "transcoding",
  "completed",
  "failed",
  "cancelled",
]);
export type JobState = z.infer<typeof JobState>;

// ─── Download jobs (request + state payloads) ─────────────────────────────────

export const DownloadRequestSchema = z.object({
  videoId: z.string().min(11).max(11),
  format: AudioFormat,
  quality: AudioQuality,
});
export type DownloadRequest = z.infer<typeof DownloadRequestSchema>;

export const DownloadEstimateSchema = z.object({
  videoId: z.string().min(11).max(11),
  format: AudioFormat.optional(),
  quality: AudioQuality.optional(),
});
export type DownloadEstimate = z.infer<typeof DownloadEstimateSchema>;

/** Result of `POST /downloads/estimate`. */
export const DownloadEstimateResultSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  uploaderName: z.string(),
  duration: z.number().int().nonnegative(),
  /** estimated output length in bytes, or null if unknown */
  estimatedSize: z.number().int().nonnegative().nullable(),
  exact: z.boolean(),
  /** displayed as a range when `exact` is false (D6) */
  sizeRange: z
    .object({
      min: z.number().int().nonnegative().nullable(),
      max: z.number().int().nonnegative().nullable(),
    })
    .optional(),
});
export type DownloadEstimateResult = z.infer<
  typeof DownloadEstimateResultSchema
>;

// DownloadJob is backed by the DB; these are the wire/SSE shapes.

export const DownloadItemStateSchema = z.enum([
  "queued",
  "resolving",
  "downloading",
  "transcoding",
  "completed",
  "failed",
  "cancelled",
]);
export type DownloadItemState = z.infer<typeof DownloadItemStateSchema>;

export const DownloadItemSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  title: z.string(),
  state: DownloadItemStateSchema,
  progress: z.number().int().min(0).max(100),
  filePath: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  position: z.number().int().nonnegative(),
});
export type DownloadItem = z.infer<typeof DownloadItemSchema>;

export const DownloadJobSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  title: z.string(),
  format: z.string(),
  quality: z.string(),
  state: JobState,
  progress: z.number().int().min(0).max(100),
  errorCode: z.string().nullable().optional(),
  filePath: z.string().nullable().optional(),
  fileSize: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().optional(),
});
export type DownloadJob = z.infer<typeof DownloadJobSchema>;
