import { ErrorCode, Playlist, SearchResult, Video, VideoSummary } from '@music/shared';
import { MediaProvider } from './media-provider.interface.js';
import { PipedProvider } from './piped.provider.js';
import { YtDlpProvider } from './yt-dlp.provider.js';
import { ProviderException } from '../../errors/provider.exception.js';
import { logger } from '../../lib/logger.js';

const log = logger.create('ProviderChain');

interface CircuitState {
  failures: number;
  openedAt: number;
  isOpen: boolean;
}

const TERMINAL_CODES: ReadonlySet<string> = new Set([
  ErrorCode.VIDEO_NOT_FOUND,
  ErrorCode.PLAYLIST_NOT_FOUND,
  ErrorCode.INVALID_SOURCE,
]);

export class ProviderChain implements MediaProvider {
  readonly name = 'chain';
  private readonly providers: MediaProvider[];
  private readonly circuits = new Map<string, CircuitState>();

  private readonly failureThreshold = 5;
  private readonly cooldownMs = 60_000;

  // Circuits are keyed by provider *and* operation. A provider can be healthy
  // for one call and structurally broken for another — a Piped build that
  // serves search fine but never returns audio streams is the motivating case.
  // Keying on the provider alone let those getVideo failures disable search
  // too, and let a successful search reset the count so getVideo never stopped
  // paying the full timeout.
  constructor(piped: PipedProvider, ytDlp: YtDlpProvider) {
    this.providers = [piped, ytDlp];
  }

  private circuit(name: string): CircuitState {
    let state = this.circuits.get(name);
    if (!state) {
      state = { failures: 0, openedAt: 0, isOpen: false };
      this.circuits.set(name, state);
    }
    return state;
  }

  private isAvailable(name: string): boolean {
    const state = this.circuit(name);
    if (!state.isOpen) return true;
    return Date.now() - state.openedAt >= this.cooldownMs;
  }

  private recordSuccess(key: string): void {
    const state = this.circuit(key);
    if (state.isOpen || state.failures > 0) {
      log.log(`Provider ${key} recovered`);
    }
    state.failures = 0;
    state.isOpen = false;
  }

  private recordFailure(key: string): void {
    const state = this.circuit(key);
    state.failures++;

    if (state.failures >= this.failureThreshold) {
      state.openedAt = Date.now();
      if (!state.isOpen) {
        state.isOpen = true;
        log.warn(`Provider ${key} circuit opened after ${state.failures} consecutive failures`);
      }
    }
  }

  private async run<T>(operation: string, fn: (provider: MediaProvider) => Promise<T>): Promise<T> {
    const attempted: string[] = [];
    let lastError: unknown;

    for (const provider of this.providers) {
      const key = `${provider.name}:${operation}`;

      if (!this.isAvailable(key)) {
        log.debug(`Skipping ${provider.name} for ${operation} (circuit open)`);
        continue;
      }

      attempted.push(provider.name);
      try {
        const result = await fn(provider);
        this.recordSuccess(key);
        return result;
      } catch (error) {
        lastError = error;

        if (error instanceof ProviderException && TERMINAL_CODES.has(error.code)) {
          this.recordSuccess(key);
          throw error;
        }

        if (error instanceof ProviderException && error.code === ErrorCode.UNSUPPORTED_OPERATION) {
          log.debug(`${provider.name} does not support ${operation}`);
          attempted.pop();
          continue;
        }

        this.recordFailure(key);
        console.warn(`${provider.name} failed ${operation}: ${(error as Error).message}`);
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
    return this.run('getSuggestions', (provider) => provider.getSuggestions(videoId));
  }
}