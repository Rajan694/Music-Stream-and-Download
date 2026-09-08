import type { AudioFormat, AudioQuality } from "@music/shared";

export const FORMAT_EXTENSION: Record<AudioFormat, string> = {
  mp3: "mp3",
  webm: "webm",
  ogg: "ogg",
};

export const MP3_BITRATE: Record<AudioQuality, string> = {
  low: "96k",
  medium: "160k",
  high: "192k",
};

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

export function oggArgs(_quality: AudioQuality): string[] {
  return ["-vn", "-acodec", "libvorbis", "-q:a", "3"];
}

export function webmTranscodeArgs(_quality: AudioQuality): string[] {
  return ["-vn", "-acodec", "libopus", "-b:a", "160k"];
}

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