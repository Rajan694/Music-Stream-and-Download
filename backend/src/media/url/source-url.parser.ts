import { ErrorCode } from '@music/shared';
import { ProviderException } from '../../errors/provider.exception.js';

export type ParsedIntent =
  | { type: 'video'; id: string }
  | { type: 'playlist'; id: string }
  | { type: 'search'; query: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/;

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

const PATH_PREFIXES = ['/shorts/', '/embed/', '/v/', '/live/'];

export class SourceUrlParser {
  parse(input: string): ParsedIntent {
    const trimmed = input.trim();

    if (!trimmed) {
      throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Query must not be empty');
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return this.parseUrl(trimmed);
    }

    return { type: 'search', query: trimmed };
  }

  private parseUrl(raw: string): ParsedIntent {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Malformed URL');
    }

    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
      throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Only YouTube links are supported');
    }

    if (url.hostname.toLowerCase().endsWith('youtu.be')) {
      const id = url.pathname.slice(1).split('/')[0];
      if (VIDEO_ID.test(id)) return { type: 'video', id };
    }

    const v = url.searchParams.get('v');
    if (v && VIDEO_ID.test(v)) return { type: 'video', id: v };

    for (const prefix of PATH_PREFIXES) {
      if (url.pathname.startsWith(prefix)) {
        const id = url.pathname.slice(prefix.length).split('/')[0];
        if (VIDEO_ID.test(id)) return { type: 'video', id };
      }
    }

    const list = url.searchParams.get('list');
    if (list && PLAYLIST_ID.test(list)) return { type: 'playlist', id: list };

    throw new ProviderException(ErrorCode.INVALID_SOURCE, 'No video or playlist id found in URL');
  }

  assertVideoId(id: string): string {
    if (!VIDEO_ID.test(id)) {
      throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Invalid video id');
    }
    return id;
  }

  assertPlaylistId(id: string): string {
    if (!PLAYLIST_ID.test(id)) {
      throw new ProviderException(ErrorCode.INVALID_SOURCE, 'Invalid playlist id');
    }
    return id;
  }
}