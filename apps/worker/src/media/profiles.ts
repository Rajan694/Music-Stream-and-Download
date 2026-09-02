import type { AudioFormat, AudioQuality } from "@music/shared";

/** Output container extension for each format. */
export const FORMAT_EXTENSION: Record<AudioFormat, string> = {
  mp3: "mp3",
  webm: "webm",
  ogg: "ogg",
};

/**
 * MP3 bitrate profiles (§ M4).
 * low=96k, medium=160k, high=192k.
 */
export const MP3_BITRATE: Record<AudioQuality, string> = {
  low: "96k",
  medium: "160k",
  high: "192k",
};

/** Fixed FFmpeg argument array for transcoding to MP3. */
export function mp3Args(quality: AudioQuality): string[] {
  return [
    "-vn",
    "-acodec",
    "libmp3lame",
    "-b:a",
    MP3_BITRATE[quality],
    "-ar",
    "44100",
  ];
}

/** Fixed FFmpeg argument array for Ogg/Vorbis. */
export function oggArgs(_quality: AudioQuality): string[] {
  return ["-vn", "-acodec", "libvorbis", "-q:a", "3"];
}

/**
 * Fixed FFmpeg args for the WebM/Opus target.
 *
 * When the source is already Opus and the target is WebM, the worker uses
 * `-c copy` (handled in the pipeline) to skip transcoding — near-instant and
 * lossless. This is the transcoding fallback for a non-Opus source.
 */
export function webmTranscodeArgs(_quality: AudioQuality): string[] {
  return ["-vn", "-acodec", "libopus", "-b:a", "160k"];
}

/**
 * Returns the fixed argument array for the requested format/quality profile.
 * The user only ever selects the format + quality enums — never raw FFmpeg args (§29).
 */
export function profileArgs(
  format: AudioFormat,
  quality: AudioQuality,
): string[] {
  switch (format) {
    case "mp3":
      return mp3Args(quality);
    case "ogg":
      return oggArgs(quality);
    case "webm":
      return webmTranscodeArgs(quality);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
