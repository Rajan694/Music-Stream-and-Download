import { z } from "zod";
import {
  AudioFormat,
  AudioQuality,
  Playlist,
  PlaylistSchema,
  SearchResult,
  Video,
  VideoSchema,
  VideoSummarySchema,
} from "@music/shared";
import { useAuthStore } from "../stores/auth.store";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

/** Wire contract returned by `GET /media/search` (§10). */
export type SearchApiResponse =
  | { intent: "video"; id: string }
  | { intent: "playlist"; id: string }
  | { intent: "search"; data: SearchResult };

export interface RecentSongRecord {
  id: string;
  videoId: string;
  title: string;
  uploaderName: string;
  thumbnailUrl: string | null;
  duration: number;
  playedAt: string;
}

export interface PinnedPlaylistRecord {
  id: string;
  playlistId: string;
  title: string;
  thumbnailUrl: string | null;
  videoCount: number;
  pinnedAt: string;
}

export interface UserSettings {
  defaultFormat: AudioFormat;
  defaultQuality: AudioQuality;
  theme: "light" | "dark" | "system";
}

export interface DownloadEstimate {
  videoId: string;
  title: string;
  uploaderName: string;
  duration: number;
  estimatedSize: number | null;
  exact: boolean;
  sizeRange?: { min: number; max: number };
}

export interface PlaylistDownloadEstimate {
  playlistId: string;
  title: string;
  uploaderName: string;
  /** Tracks in the playlist. */
  totalCount: number;
  /** Tracks that will actually be queued. */
  itemCount: number;
  /** Dropped for being too long, or having no duration at all (live). */
  skippedCount: number;
  /** Eligible but past the per-request cap. */
  overCapCount: number;
  maxItems: number;
  totalDuration: number;
  estimatedSize: number | null;
  exact: boolean;
  sizeRange?: { min: number; max: number };
}

export interface DownloadItemRecord {
  id: string;
  videoId: string;
  title: string;
  state: string;
  progress: number;
  errorCode: string | null;
  position: number;
}

export interface DownloadJobRecord {
  id: string;
  kind: "video" | "playlist";
  videoId: string | null;
  playlistId: string | null;
  title: string;
  format: string;
  quality: string;
  state: string;
  progress: number;
  errorCode: string | null;
  fileSize: number | null;
  createdAt: string;
  items: DownloadItemRecord[];
}

interface FetchOptions<T> {
  schema?: z.ZodType<T>;
  method?: string;
  body?: unknown;
  authed?: boolean;
  /** Send the refresh cookie — only the session routes need it. */
  credentials?: boolean;
  /**
   * Internal. Cleared on the retry so a refresh that itself 401s cannot loop,
   * and set false on `/auth/refresh` so it never tries to refresh itself.
   */
  retryOnUnauthorized?: boolean;
}

/**
 * Single-flight refresh. The access token lives in memory with a 15 minute TTL
 * while the page can stay open far longer, so any authed call may find it
 * expired. Refresh tokens rotate and reuse revokes the whole family, meaning
 * two concurrent 401s must share one exchange rather than redeem the cookie
 * twice.
 */
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    try {
      const { accessToken } = await fetchApi<{ accessToken: string }>(
        "/auth/refresh",
        { method: "POST", credentials: true, retryOnUnauthorized: false },
      );
      // Keep the user object: only the token went stale.
      useAuthStore
        .getState()
        .setAuth(useAuthStore.getState().user, accessToken);
      return accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function fetchApi<T>(
  endpoint: string,
  opts: FetchOptions<T> = {},
): Promise<T> {
  const {
    schema,
    method = "GET",
    body,
    authed = false,
    credentials = false,
    retryOnUnauthorized = true,
  } = opts;

  const headers = new Headers({ "Content-Type": "application/json" });
  if (authed) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: credentials ? "include" : "same-origin",
  });

  // An expired access token is the common case here, not a real sign-out, so
  // exchange the refresh cookie and replay the request once.
  if (response.status === 401 && authed && retryOnUnauthorized) {
    try {
      await refreshAccessToken();
    } catch {
      useAuthStore.getState().logout();
      throw new Error("Your session has expired. Please sign in again.");
    }
    return fetchApi<T>(endpoint, { ...opts, retryOnUnauthorized: false });
  }

  if (!response.ok) {
    let errorDesc = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = await response.json();
      if (errorJson.message) errorDesc = errorJson.message;
    } catch {
      // Non-JSON error body; the status line above is the best we have.
    }
    throw new Error(errorDesc);
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json();
  if (schema) return schema.parse(data);
  return data as T;
}

export const apiClient = {
  // ─── Media ─────────────────────────────────────────────────────────────────
  search: (query: string) =>
    fetchApi<SearchApiResponse>(`/media/search?q=${encodeURIComponent(query)}`),
  getVideo: (id: string): Promise<Video> =>
    fetchApi(`/media/videos/${id}`, { schema: VideoSchema }),
  getPlaylist: (id: string): Promise<Playlist> =>
    fetchApi(`/media/playlists/${id}`, { schema: PlaylistSchema }),
  getSuggestions: (id: string) =>
    fetchApi(`/media/videos/${id}/suggestions`, {
      schema: z.array(VideoSummarySchema),
    }),

  // ─── Session ───────────────────────────────────────────────────────────────
  /**
   * Exchanges the refresh cookie for a fresh access token. Also the final step
   * of the Google flow: the callback sets the cookie, then the browser lands on
   * `/auth/callback` and calls this.
   */
  // Shares the single-flight exchange with the 401 retry path: a bootstrap that
  // overlaps an expiring request must not redeem the rotating cookie twice.
  refresh: async () => ({ accessToken: await refreshAccessToken() }),
  me: () =>
    fetchApi<{ id: string; email: string }>("/auth/me", { authed: true }),
  logout: () =>
    fetchApi<{ success: boolean }>("/auth/logout", {
      method: "POST",
      credentials: true,
    }),

  // ─── History ───────────────────────────────────────────────────────────────
  getHistory: () =>
    fetchApi<RecentSongRecord[]>("/me/history", { authed: true }),
  addHistory: (song: {
    videoId: string;
    title: string;
    uploaderName: string;
    thumbnailUrl?: string;
    duration: number;
    playedAt: string;
  }) =>
    fetchApi<RecentSongRecord>("/me/history", {
      method: "POST",
      authed: true,
      body: song,
    }),
  syncHistory: (items: unknown[]) =>
    fetchApi<RecentSongRecord[]>("/me/history/sync", {
      method: "POST",
      authed: true,
      body: { items },
    }),

  // ─── Pinned playlists ──────────────────────────────────────────────────────
  getPinnedPlaylists: () =>
    fetchApi<PinnedPlaylistRecord[]>("/me/playlists", { authed: true }),
  pinPlaylist: (playlist: {
    playlistId: string;
    title: string;
    thumbnailUrl?: string;
    videoCount?: number;
  }) =>
    fetchApi<PinnedPlaylistRecord>("/me/playlists", {
      method: "POST",
      authed: true,
      body: playlist,
    }),
  unpinPlaylist: (playlistId: string) =>
    fetchApi<{ count: number }>(`/me/playlists/${playlistId}`, {
      method: "DELETE",
      authed: true,
    }),

  // ─── Settings ──────────────────────────────────────────────────────────────
  getSettings: () => fetchApi<UserSettings>("/me/settings", { authed: true }),
  updateSettings: (patch: Partial<UserSettings>) =>
    fetchApi<UserSettings>("/me/settings", {
      method: "PATCH",
      authed: true,
      body: patch,
    }),

  // ─── Downloads ─────────────────────────────────────────────────────────────
  estimateDownload: (videoId: string, format: string, quality: string) =>
    fetchApi<DownloadEstimate>("/downloads/estimate", {
      method: "POST",
      authed: true,
      body: { videoId, format, quality },
    }),
  createDownload: (videoId: string, format: string, quality: string) =>
    fetchApi<{
      id: string;
      videoId: string;
      title: string;
      state: string;
      progress: number;
    }>("/downloads", {
      method: "POST",
      authed: true,
      body: { videoId, format, quality },
    }),
  getDownload: (id: string) =>
    fetchApi<DownloadJobRecord>(`/downloads/${id}`, { authed: true }),
  listDownloads: () =>
    fetchApi<
      Array<{
        id: string;
        videoId: string;
        title: string;
        format: string;
        quality: string;
        state: string;
        progress: number;
        fileSize: number | null;
        createdAt: string;
      }>
    >("/downloads", { authed: true }),
  // ─── Playlist downloads ────────────────────────────────────────────────────
  estimatePlaylistDownload: (
    playlistId: string,
    format: string,
    quality: string,
  ) =>
    fetchApi<PlaylistDownloadEstimate>("/downloads/playlist/estimate", {
      method: "POST",
      authed: true,
      body: { playlistId, format, quality },
    }),
  createPlaylistDownload: (
    playlistId: string,
    format: string,
    quality: string,
  ) =>
    fetchApi<DownloadJobRecord>("/downloads/playlist", {
      method: "POST",
      authed: true,
      body: { playlistId, format, quality },
    }),

  /** Absolute URL for the finished file; the token rides in the query string. */
  downloadFileUrl: (id: string) => {
    const token = useAuthStore.getState().accessToken;
    return `${API_BASE_URL}/downloads/${id}/file?token=${encodeURIComponent(token ?? "")}`;
  },
  /** Zip of every completed track in a playlist job. */
  playlistArchiveUrl: (id: string) => {
    const token = useAuthStore.getState().accessToken;
    return `${API_BASE_URL}/downloads/${id}/archive?token=${encodeURIComponent(token ?? "")}`;
  },
};
