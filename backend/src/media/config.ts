import { Env, loadEnv } from '../config/env.js';

export class MediaConfig {
  private readonly env: Env = loadEnv();

  get pipedApiUrl(): string {
    return this.env.PIPED_API_URL;
  }

  get pipedFallbackUrls(): string[] {
    return this.env.pipedFallbackUrls;
  }

  get providerTimeoutMs(): number {
    return this.env.PROVIDER_TIMEOUT_MS;
  }

  get providerRetries(): number {
    return this.env.PROVIDER_RETRIES;
  }

  get providerDeadlineMs(): number {
    return this.env.PROVIDER_DEADLINE_MS;
  }

  get ytDlpPath(): string {
    return this.env.YT_DLP_PATH;
  }

  get ytDlpTimeoutMs(): number {
    return this.env.YT_DLP_TIMEOUT_MS;
  }

  get searchTtlMs(): number {
    return this.env.CACHE_SEARCH_TTL_MS;
  }

  get videoTtlMs(): number {
    return this.env.CACHE_VIDEO_TTL_MS;
  }

  get playlistTtlMs(): number {
    return this.env.CACHE_PLAYLIST_TTL_MS;
  }

  get streamTtlMs(): number {
    return this.env.CACHE_STREAM_TTL_MS;
  }

  get cacheMaxEntries(): number {
    return this.env.CACHE_MAX_ENTRIES;
  }

  get redisUrl(): string | undefined {
    return this.env.REDIS_URL;
  }
}