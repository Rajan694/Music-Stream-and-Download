import { Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  Playlist,
  SearchResult,
  Video,
  VideoSummary,
} from '@music/shared';
import { MediaProvider } from './media-provider.interface.js';
import { PipedProvider } from './piped.provider.js';
import { YtDlpProvider } from './yt-dlp.provider.js';
import { ProviderException } from '../../common/errors/provider.exception.js';

interface CircuitState {
  failures: number;
  openedAt: number;
  isOpen: boolean;
}

/**
 * Error codes that describe the *content*, not the provider. Falling back
 * cannot change the answer, so the chain stops immediately.
 */
const TERMINAL_CODES: ReadonlySet<string> = new Set([
  ErrorCode.VIDEO_NOT_FOUND,
  ErrorCode.PLAYLIST_NOT_FOUND,
  ErrorCode.INVALID_SOURCE,
]);

@Injectable()
export class ProviderChain implements MediaProvider {
  readonly name = 'chain';
  private readonly logger = new Logger(ProviderChain.name);

  private readonly providers: MediaProvider[];
  private readonly circuits = new Map<string, CircuitState>();

  private readonly failureThreshold = 5;
  private readonly cooldownMs = 60_000;

  constructor(piped: PipedProvider, ytDlp: YtDlpProvider) {
    this.providers = [piped, ytDlp];
    for (const provider of this.providers) {
      this.circuits.set(provider.name, {
        failures: 0,
        openedAt: 0,
        isOpen: false,
      });
    }
  }

  private circuit(name: string): CircuitState {
    let state = this.circuits.get(name);
    if (!state) {
      state = { failures: 0, openedAt: 0, isOpen: false };
      this.circuits.set(name, state);
    }
    return state;
  }

  /** Closed, or open long enough to allow a single half-open probe. */
  private isAvailable(name: string): boolean {
    const state = this.circuit(name);
    if (!state.isOpen) return true;
    return Date.now() - state.openedAt >= this.cooldownMs;
  }

  private recordSuccess(name: string): void {
    const state = this.circuit(name);
    if (state.isOpen || state.failures > 0) {
      this.logger.log(`Provider ${name} recovered`);
    }
    state.failures = 0;
    state.isOpen = false;
  }

  private recordFailure(name: string): void {
    const state = this.circuit(name);
    state.failures++;

    if (state.failures >= this.failureThreshold) {
      // Re-stamp on every failure so a failed half-open probe restarts the
      // cooldown instead of retrying on the next request.
      state.openedAt = Date.now();
      if (!state.isOpen) {
        state.isOpen = true;
        this.logger.warn(
          `Provider ${name} circuit opened after ${state.failures} consecutive failures`,
        );
      }
    }
  }

  private async run<T>(
    operation: string,
    fn: (provider: MediaProvider) => Promise<T>,
  ): Promise<T> {
    const attempted: string[] = [];
    let lastError: unknown;

    for (const provider of this.providers) {
      if (!this.isAvailable(provider.name)) {
        this.logger.debug(
          `Skipping ${provider.name} for ${operation} (circuit open)`,
        );
        continue;
      }

      attempted.push(provider.name);
      try {
        const result = await fn(provider);
        this.recordSuccess(provider.name);
        return result;
      } catch (error) {
        lastError = error;

        if (
          error instanceof ProviderException &&
          TERMINAL_CODES.has(error.code)
        ) {
          // A definitive answer, not a provider fault: don't trip the breaker.
          this.recordSuccess(provider.name);
          throw error;
        }

        // A provider that cannot perform this operation at all is not failing.
        if (
          error instanceof ProviderException &&
          error.code === ErrorCode.UNSUPPORTED_OPERATION
        ) {
          this.logger.debug(`${provider.name} does not support ${operation}`);
          attempted.pop();
          continue;
        }

        this.recordFailure(provider.name);
        this.logger.warn(
          `Provider ${provider.name} failed ${operation}: ${(error as Error).message}`,
        );
      }
    }

    if (attempted.length === 0) {
      throw new ProviderException(
        ErrorCode.PROVIDER_UNAVAILABLE,
        `No provider can currently serve ${operation}`,
        lastError,
      );
    }

    throw new ProviderException(
      ErrorCode.PROVIDER_UNAVAILABLE,
      `${operation} failed across all providers (${attempted.join(', ')})`,
      lastError,
    );
  }

  search(query: string): Promise<SearchResult> {
    return this.run('search', (provider) => provider.search(query));
  }

  getVideo(id: string): Promise<Video> {
    return this.run('getVideo', async (provider) => {
      const video = await provider.getVideo(id);

      // An audio product cannot use a video with no audio. A provider that has
      // lost audio extraction still answers 200 with full metadata and an empty
      // `audioStreams`, which would otherwise count as success: the result gets
      // cached for a full TTL, the circuit never opens, and playback stays
      // broken while a working provider sits unused behind it.
      if (!video.audioStreams.length) {
        throw new ProviderException(
          ErrorCode.PROVIDER_ERROR,
          `${provider.name} returned no audio streams for ${id}`,
        );
      }

      return video;
    });
  }

  getPlaylist(id: string): Promise<Playlist> {
    return this.run('getPlaylist', async (provider) => {
      const playlist = await provider.getPlaylist(id);

      // Same shape of lie as an audio-less video: the provider reports a track
      // count but hands back no tracks. A genuinely empty playlist has
      // `videoCount` 0 too, so only the contradiction is treated as a fault —
      // otherwise an empty result caches for an hour and every consumer, the
      // playlist page and playlist downloads alike, sees nothing to work with.
      if (playlist.videoCount > 0 && playlist.videos.length === 0) {
        throw new ProviderException(
          ErrorCode.PROVIDER_ERROR,
          `${provider.name} returned no tracks for playlist ${id} despite a count of ${playlist.videoCount}`,
        );
      }

      return playlist;
    });
  }

  getSuggestions(videoId: string): Promise<VideoSummary[]> {
    return this.run('getSuggestions', (provider) =>
      provider.getSuggestions(videoId),
    );
  }
}
