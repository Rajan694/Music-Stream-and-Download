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

/**
 * Ceiling on tracks accepted from one playlist. A playlist is unbounded input —
 * without this, a single request could queue thousands of transcodes.
 */
const MAX_PLAYLIST_ITEMS = Number(process.env.MAX_PLAYLIST_ITEMS ?? 50);

/** States a job or item occupies while the worker still owns it. */
const ACTIVE_STATES = [
  'queued',
  'resolving',
  'downloading',
  'transcoding',
] as const;

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

    const bitrate = this.outputBitrate(targetFormat, targetQuality);

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

  /**
   * Estimates a whole playlist without resolving a single track.
   *
   * The per-video estimate needs a provider round trip, which for fifty tracks
   * would be fifty yt-dlp spawns before the user has even confirmed. Playlist
   * metadata already carries each duration, and duration is the only input the
   * transcode estimate actually uses, so the sum is just as honest and costs
   * one call.
   */
  async estimatePlaylist(
    playlistId: string,
    format?: AudioFormat,
    quality?: AudioQuality,
  ) {
    const playlist = await this.providers
      .getPlaylist(playlistId)
      .catch(() => null);
    if (!playlist) throw new NotFoundException('Playlist not found');

    const targetFormat = format ?? 'mp3';
    const targetQuality = quality ?? 'high';
    const bitrate = this.outputBitrate(targetFormat, targetQuality);

    const { queued, skippedCount, overCapCount } = this.selectTracks(
      playlist.videos,
    );
    const totalDuration = queued.reduce(
      (sum, track) => sum + track.duration,
      0,
    );
    const nominal = Math.round((bitrate / 8) * totalDuration);

    return {
      playlistId,
      title: playlist.title,
      uploaderName: playlist.uploaderName,
      totalCount: playlist.videos.length,
      // What will actually be queued, which is not always what the playlist
      // holds — see `selectTracks`.
      itemCount: queued.length,
      skippedCount,
      overCapCount,
      maxItems: MAX_PLAYLIST_ITEMS,
      totalDuration,
      estimatedSize: totalDuration ? nominal : null,
      exact: false,
      sizeRange: totalDuration
        ? {
            min: Math.round(nominal * (1 - SIZE_TOLERANCE)),
            max: Math.round(nominal * (1 + SIZE_TOLERANCE)),
          }
        : undefined,
    };
  }

  /**
   * Queues a playlist as one parent job with a `DownloadItem` per track. The
   * worker claims the parent, so a playlist stays a single unit of work rather
   * than fifty rows competing with everyone else's downloads.
   */
  async createPlaylist(
    userId: string,
    playlistId: string,
    format: AudioFormat,
    quality: AudioQuality,
  ) {
    const playlist = await this.providers
      .getPlaylist(playlistId)
      .catch(() => null);
    if (!playlist) throw new NotFoundException('Playlist not found');

    const { queued } = this.selectTracks(playlist.videos);
    if (!queued.length) {
      throw new ForbiddenException(
        'No track in this playlist is within the allowed duration',
      );
    }

    // Same guard as a single download: re-submitting must not queue the work
    // twice.
    const pending = await this.prisma.downloadJob.findFirst({
      where: {
        userId,
        kind: 'playlist',
        playlistId,
        format,
        quality,
        state: { in: [...ACTIVE_STATES] },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (pending) return pending;

    return this.prisma.downloadJob.create({
      data: {
        userId,
        kind: 'playlist',
        playlistId,
        videoId: null,
        title: playlist.title,
        format,
        quality,
        state: 'queued',
        progress: 0,
        items: {
          create: queued.map((track, position) => ({
            videoId: track.id,
            title: track.title,
            state: 'queued',
            progress: 0,
            position,
          })),
        },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async list(userId: string) {
    return this.prisma.downloadJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async get(userId: string, id: string) {
    const job = await this.prisma.downloadJob.findUnique({
      where: { id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!job) throw new NotFoundException('Download not found');
    // Same response as a missing job, so job ids cannot be probed for existence.
    if (job.userId !== userId)
      throw new NotFoundException('Download not found');
    return job;
  }

  /**
   * Files to put in the archive for a completed playlist job.
   *
   * Only items that both completed and still have bytes on disk are included:
   * the temp sweeper runs an hour after completion, so a partially swept job
   * must yield a short archive rather than a stream that dies mid-entry.
   */
  async getPlaylistFiles(userId: string, id: string) {
    const job = await this.get(userId, id);

    if (job.kind !== 'playlist') {
      throw new NotFoundException('Download is not a playlist');
    }

    const completed = job.items.filter(
      (item) => item.state === 'completed' && item.filePath,
    );

    const present: Array<{ path: string; filename: string }> = [];
    for (const item of completed) {
      try {
        await stat(item.filePath!);
        present.push({
          path: item.filePath!,
          filename: basename(item.filePath!),
        });
      } catch {
        // Swept since completion — skip rather than fail the whole archive.
      }
    }

    if (!present.length) {
      throw new NotFoundException(
        'No files are available for this playlist download',
      );
    }

    return { title: job.title, files: present };
  }

  /** Serves one track out of a playlist job. */
  async getItemFile(userId: string, id: string, itemId: string) {
    const job = await this.get(userId, id);
    const item = job.items.find((candidate) => candidate.id === itemId);

    if (!item) throw new NotFoundException('Download item not found');
    if (item.state !== 'completed' || !item.filePath) {
      throw new NotFoundException('File not ready');
    }

    try {
      await stat(item.filePath);
    } catch {
      throw new NotFoundException(
        'File has expired and is no longer available',
      );
    }

    return { path: item.filePath, filename: basename(item.filePath) };
  }

  /**
   * Resolves the on-disk file for a completed job. The path comes from the
   * worker via the database, never from the request, so there is nothing for a
   * caller to traverse.
   */
  async getFile(userId: string, id: string) {
    const job = await this.get(userId, id);

    if (job.kind === 'playlist') {
      // A playlist has no single output; the archive route serves it instead.
      throw new NotFoundException(
        'This is a playlist download — use the archive endpoint',
      );
    }

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

  /** Nominal output bitrate (bits/s) the worker will encode at. */
  private outputBitrate(format: AudioFormat, quality: AudioQuality): number {
    if (format === 'mp3') return MP3_BITRATE[quality];
    if (format === 'ogg') return VORBIS_BITRATE;
    return OPUS_BITRATE;
  }

  /**
   * Splits a playlist into what will actually be queued and why the rest was
   * left out.
   *
   * The two reasons are reported separately on purpose: "too long to download"
   * and "past the per-request cap" are different problems with different fixes,
   * and collapsing them into one number tells the user the wrong one.
   */
  private selectTracks<T extends { duration: number }>(tracks: T[]) {
    const maxDuration = Number(process.env.MAX_DOWNLOAD_DURATION ?? 1800);

    // No duration at all means a live stream or premiere: no fixed end, so it
    // would run until the job timeout.
    const eligible = tracks.filter(
      (track) => track.duration > 0 && track.duration <= maxDuration,
    );

    return {
      queued: eligible.slice(0, MAX_PLAYLIST_ITEMS),
      skippedCount: tracks.length - eligible.length,
      overCapCount: Math.max(0, eligible.length - MAX_PLAYLIST_ITEMS),
    };
  }

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
