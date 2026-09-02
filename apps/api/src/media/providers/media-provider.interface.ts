import { Playlist, SearchResult, Video, VideoSummary } from '@music/shared';

/**
 * Contract every media provider implements. Only internal domain models cross
 * this line — provider payload shapes stop at the implementation (§55).
 */
export interface MediaProvider {
  /** Stable identifier used for logging and circuit-breaker state. */
  readonly name: string;

  search(query: string): Promise<SearchResult>;

  getVideo(id: string): Promise<Video>;

  getPlaylist(id: string): Promise<Playlist>;

  /**
   * Related videos for autoplay. Providers that cannot supply these must
   * reject with `UNSUPPORTED_OPERATION` rather than resolve to an empty list,
   * so a fallback chain can tell "none" from "not available here".
   */
  getSuggestions(videoId: string): Promise<VideoSummary[]>;
}
