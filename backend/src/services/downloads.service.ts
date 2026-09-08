import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { AudioFormat, AudioQuality, AudioStream, ErrorCode, Video } from '@music/shared';
import { PrismaClient } from '@music/db';
import { ProviderChain } from '../media/providers/provider-chain.js';
import { HttpError } from '../lib/http-error.js';
import { loadEnv, type Env } from '../config/env.js';
import type { Queue } from 'bullmq';

const MP3_BITRATE: Record<AudioQuality, number> = {
  low: 96_000,
  medium: 160_000,
  high: 192_000,
};

const OPUS_BITRATE = 160_000;
const VORBIS_BITRATE = 112_000;
const SIZE_TOLERANCE = 0.15;

const ACTIVE_STATES = ['queued', 'resolving', 'downloading', 'transcoding'] as const;

export class DownloadsService {
  private readonly env: Env;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly providers: ProviderChain,
    private readonly queue: Queue,
  ) {
    this.env = loadEnv();
  }

  async estimate(videoId: string, format?: AudioFormat, quality?: AudioQuality) {
    const video = await this.providers.getVideo(videoId).catch(() => null);
    if (!video) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Video not found');

    const targetFormat = format ?? 'mp3';
    const targetQuality = quality ?? 'high';
    const source = this.selectSourceStream(video, targetQuality);

    const isCopy = targetFormat === 'webm' && this.isOpus(source);

    if (isCopy && source?.contentLength) {
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

  async create(userId: string, videoId: string, format: AudioFormat, quality: AudioQuality) {
    const video = await this.providers.getVideo(videoId).catch(() => null);
    if (!video) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Video not found');

    const maxDuration = this.env.MAX_DOWNLOAD_DURATION;
    if (video.duration > maxDuration) {
      throw new HttpError(403, ErrorCode.DOWNLOAD_TOO_LONG, 'Video exceeds the maximum allowed duration');
    }

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

    const job = await this.prisma.downloadJob.create({
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

    await this.queue.add('video', { jobId: job.id, kind: 'video' }, { jobId: job.id });
    return job;
  }

  async estimatePlaylist(playlistId: string, format?: AudioFormat, quality?: AudioQuality) {
    const playlist = await this.providers.getPlaylist(playlistId).catch(() => null);
    if (!playlist) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Playlist not found');

    const targetFormat = format ?? 'mp3';
    const targetQuality = quality ?? 'high';
    const bitrate = this.outputBitrate(targetFormat, targetQuality);

    const { queued, skippedCount, overCapCount } = this.selectTracks(playlist.videos);
    const totalDuration = queued.reduce((sum, track) => sum + track.duration, 0);
    const nominal = Math.round((bitrate / 8) * totalDuration);

    return {
      playlistId,
      title: playlist.title,
      uploaderName: playlist.uploaderName,
      totalCount: playlist.videos.length,
      itemCount: queued.length,
      skippedCount,
      overCapCount,
      maxItems: this.env.MAX_PLAYLIST_ITEMS,
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

  async createPlaylist(userId: string, playlistId: string, format: AudioFormat, quality: AudioQuality) {
    const playlist = await this.providers.getPlaylist(playlistId).catch(() => null);
    if (!playlist) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Playlist not found');

    const { queued } = this.selectTracks(playlist.videos);
    if (!queued.length) {
      throw new HttpError(403, ErrorCode.DOWNLOAD_TOO_LONG, 'No track in this playlist is within the allowed duration');
    }

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

    const job = await this.prisma.downloadJob.create({
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

    await this.queue.add('playlist', { jobId: job.id, kind: 'playlist' }, { jobId: job.id });
    return job;
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
    if (!job) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Download not found');
    if (job.userId !== userId)
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'Download not found');
    return job;
  }

  async getPlaylistFiles(userId: string, id: string) {
    const job = await this.get(userId, id);

    if (job.kind !== 'playlist') {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'Download is not a playlist');
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
        // Swept since completion
      }
    }

    if (!present.length) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'No files are available for this playlist download');
    }

    return { title: job.title, files: present };
  }

  async getItemFile(userId: string, id: string, itemId: string) {
    const job = await this.get(userId, id);
    const item = job.items.find((candidate) => candidate.id === itemId);

    if (!item) throw new HttpError(404, ErrorCode.NOT_FOUND, 'Download item not found');
    if (item.state !== 'completed' || !item.filePath) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'File not ready');
    }

    try {
      await stat(item.filePath);
    } catch {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'File has expired and is no longer available');
    }

    return { path: item.filePath, filename: basename(item.filePath) };
  }

  async getFile(userId: string, id: string) {
    const job = await this.get(userId, id);

    if (job.kind === 'playlist') {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'This is a playlist download — use the archive endpoint');
    }

    if (job.state !== 'completed' || !job.filePath) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'File not ready');
    }

    try {
      await stat(job.filePath);
    } catch {
      throw new HttpError(404, ErrorCode.NOT_FOUND, 'File has expired and is no longer available');
    }

    return { path: job.filePath, filename: basename(job.filePath) };
  }

  private outputBitrate(format: AudioFormat, quality: AudioQuality): number {
    if (format === 'mp3') return MP3_BITRATE[quality];
    if (format === 'ogg') return VORBIS_BITRATE;
    return OPUS_BITRATE;
  }

  private selectTracks<T extends { duration: number }>(tracks: T[]) {
    const maxDuration = this.env.MAX_DOWNLOAD_DURATION;
    const eligible = tracks.filter(
      (track) => track.duration > 0 && track.duration <= maxDuration,
    );

    return {
      queued: eligible.slice(0, this.env.MAX_PLAYLIST_ITEMS),
      skippedCount: tracks.length - eligible.length,
      overCapCount: Math.max(0, eligible.length - this.env.MAX_PLAYLIST_ITEMS),
    };
  }

  private isOpus(stream: AudioStream | undefined): boolean {
    return Boolean(stream?.codec?.toLowerCase().includes('opus'));
  }

  private selectSourceStream(video: Video, quality: AudioQuality): AudioStream | undefined {
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