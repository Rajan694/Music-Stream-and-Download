import { Playlist, SearchResult, Video, VideoSummary } from '@music/shared';

export interface MediaProvider {
  readonly name: string;
  search(query: string): Promise<SearchResult>;
  getVideo(id: string): Promise<Video>;
  getPlaylist(id: string): Promise<Playlist>;
  getSuggestions(videoId: string): Promise<VideoSummary[]>;
  getSearchSuggestions(query: string): Promise<string[]>;
}