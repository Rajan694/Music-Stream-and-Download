import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AudioFormat, AudioQuality, AudioStream, Video } from '@music/shared';
import { PrismaClient } from '@music/db';
import { ProviderChain } from '../media/providers/provider-chain.js';

/** Output bitrates (bits/s) per MP3 quality profile, mirroring the worker. */
const MP3_BITRATE: Record<AudioQuality, number> = {
  low: 96_000,
  medium: 160_000,
  high: 192_000,
};

/** Opus target for the WebM profile; the worker encodes at a fixed 160k. */
const OPUS_BITRATE = 160_000;

/** Vorbis `-q:a 3` lands around here in practice. */
const VORBIS_BITRATE = 112_000;

/** Encoders overshoot and undershoot a nominal bitrate by roughly this much. */
const SIZE_TOLERANCE = 0.15;

@Injectable()
export class DownloadsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly providers: ProviderChain,
  ) {}

  /**
   * Estimates the size of the *converted* output.
   *
   * The source `contentLength` is only the true answer when no transcode
   * happens — an already-Opus source copied into WebM. In every other case the
   * output is a re-encode at our own bitrate, so the honest number comes from
   * `duration × bitrate ÷ 8`, reported as a range (§22, D6).
   */
  async estimate(
    videoId: string,
    format?: AudioFormat,
    quality?: AudioQuality,
  ) {
    const video = await this.providers.getVideo(videoId).catch(() => null);
    if (!video) throw new NotFoundException('Video not found');

    const targetFormat = format ?? 'mp3';
    const targetQuality = quality ?? 'high';
    const source = this.selectSourceStream(video, targetQuality);

    const isCopy = targetFormat === 'webm' && this.isOpus(source);

    if (isCopy && source?.contentLength) {
      // Byte-for-byte copy: the source length is the output length.
      return this.result(videoId, video, source.contentLength, true, undefined);
    }

    const bitrate =
      targetFormat === 'mp3'
        ? MP3_BITRATE[targetQuality]
        : targetFormat === 'ogg'
          ? VORBIS_BITRATE
          : OPUS_BITRATE;

    if (!video.duration) {
      return this.result(videoId, video, null, false, undefined);
    }

    const nominal = Math.round((bitrate / 8) * video.duration);
    return this.result(videoId, video, nominal, false, {
      min: Math.round(nominal * (1 - SIZE_TOLERANCE)),
      max: Math.round(nominal * (1 + SIZE_TOLERANCE)),
    });
  }

  async create(
    userId: string,
    videoId: string,
    format: AudioFormat,
    quality: AudioQuality,
  ) {
    const video = await this.providers.getVideo(videoId).catch(() => null);
    if (!video) throw new NotFoundException('Video not found');

    const maxDuration = Number(process.env.MAX_DOWNLOAD_DURATION ?? 1800);
    if (video.duration > maxDuration) {
      throw new ForbiddenException(
        'Video exceeds the maximum allowed duration',
      );
    }

    // One queued job per user/video/profile: double-clicking Download should
    // not spend the worker twice on identical output.
    const pending = await this.prisma.downloadJob.findFirst({
      where: {
        userId,
        videoId,
        format,
        quality,
        state: { in: ['queued', 'resolving', 'downloading', 'transcoding'] },
      },
    });
    if (pending) return pending;

    return this.prisma.downloadJob.create({
      data: {
        userId,
        videoId,
        title: video.title,
        format,
        quality,
        state: 'queued',
        progress: 0,
      },
    });
  }

  async list(userId: string) {
    return this.prisma.downloadJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(userId: string, id: string) {
    const job = await this.prisma.downloadJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Download not found');
    // Same response as a missing job, so job ids cannot be probed for existence.
    if (job.userId !== userId)
      throw new NotFoundException('Download not found');
    return job;
  }

  /**
   * Resolves the on-disk file for a completed job. The path comes from the
   * worker via the database, never from the request, so there is nothing for a
   * caller to traverse.
   */
  async getFile(userId: string, id: string) {
    const job = await this.get(userId, id);

    if (job.state !== 'completed' || !job.filePath) {
      throw new NotFoundException('File not ready');
    }

    // The temp sweeper removes finished job directories, so a job can be
    // "completed" long after its bytes are gone. Check before promising a body.
    try {
      await stat(job.filePath);
    } catch {
      throw new NotFoundException(
        'File has expired and is no longer available',
      );
    }

    // The worker already normalized the title through the filename pipeline
    // (§15) when it wrote the file. Reusing `job.title` here would hand the
    // browser the raw upload title and throw that work away.
    return { path: job.filePath, filename: basename(job.filePath) };
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private isOpus(stream: AudioStream | undefined): boolean {
    return Boolean(stream?.codec?.toLowerCase().includes('opus'));
  }

  /** The stream the worker would pick: closest bitrate to the target profile. */
  private selectSourceStream(
    video: Video,
    quality: AudioQuality,
  ): AudioStream | undefined {
    if (!video.audioStreams.length) return undefined;

    const target = MP3_BITRATE[quality];
    return video.audioStreams.reduce((best, candidate) => {
      const bestDelta = best.bitrate
        ? Math.abs(best.bitrate - target)
        : Number.MAX_SAFE_INTEGER;
      const delta = candidate.bitrate
        ? Math.abs(candidate.bitrate - target)
        : Number.MAX_SAFE_INTEGER;
      return delta < bestDelta ? candidate : best;
    });
  }

  private result(
    videoId: string,
    video: Video,
    estimatedSize: number | null,
    exact: boolean,
    sizeRange: { min: number; max: number } | undefined,
  ) {
    return {
      videoId,
      title: video.title,
      uploaderName: video.uploaderName,
      duration: video.duration,
      estimatedSize,
      exact,
      sizeRange,
    };
  }
}
