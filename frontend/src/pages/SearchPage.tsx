import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ImSpinner8 } from 'react-icons/im';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchVideoItem } from '@music/shared';
import { useUIStore } from '../stores/ui.store';
import { apiClient } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { usePlayerStore } from '../stores/player.store';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';

  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastSearchQuery = useUIStore((s) => s.lastSearchQuery);
  const setLastSearchQuery = useUIStore((s) => s.setLastSearchQuery);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const playNextInQueue = usePlayerStore((s) => s.playNextInQueue);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  // The input is local state so keystrokes don't hit the URL — and therefore the
  // search query — until they settle. `pushedRef` holds the last value this page
  // wrote to the URL, so an external change (back/forward, restore below) still
  // syncs back into the box without clobbering what the user is mid-way typing.
  const [input, setInput] = useState(q);
  const pushedRef = useRef(q);
  const debouncedInput = useDebounced(input, 400);

  // Restore last query when navigating to bare /search
  useEffect(() => {
    if (!q && lastSearchQuery) {
      setParams({ q: lastSearchQuery }, { replace: true });
    }
  }, [q, lastSearchQuery, setParams]);

  useEffect(() => {
    if (q !== pushedRef.current) {
      pushedRef.current = q;
      setInput(q);
    }
  }, [q]);

  useEffect(() => {
    const value = debouncedInput.trim();
    if (value === q) return;
    pushedRef.current = value;
    if (value) {
      setParams({ q: value }, { replace: true });
      setLastSearchQuery(value);
    } else {
      setParams({}, { replace: true });
    }
  }, [debouncedInput, q, setParams, setLastSearchQuery]);

  const showSuggestions = isFocused && debouncedInput.trim().length >= 2;

  const { data: suggestions } = useQuery({
    queryKey: ['search_suggestions', debouncedInput.trim()],
    queryFn: () => apiClient.getSearchSuggestions(debouncedInput.trim()),
    enabled: showSuggestions,
    staleTime: 60_000,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['search', q],
    queryFn: async () => {
      if (!q.trim()) return null;
      const res = await apiClient.search(q);
      if (res.intent === 'video') {
        navigate(`/video/${res.id}`);
        return { intent: 'navigating' as const };
      }
      if (res.intent === 'playlist') {
        navigate(`/playlist/${res.id}`);
        return { intent: 'navigating' as const };
      }
      return res.data;
    },
    enabled: !!q.trim(),
    staleTime: 5 * 60_000,
  });

  // Bypasses the debounce for deliberate commits: suggestion clicks and Enter.
  const commitQ = (value: string) => {
    setInput(value);
    const trimmed = value.trim();
    pushedRef.current = trimmed;
    if (trimmed) {
      setParams({ q: trimmed }, { replace: true });
      setLastSearchQuery(trimmed);
    } else {
      setParams({}, { replace: true });
    }
  };

  const handlePlayNow = (item: SearchVideoItem) => {
    playTrack(item);
    queryClient
      .prefetchQuery({
        queryKey: ['video', item.id],
        queryFn: () => apiClient.getVideo(item.id),
      })
      .then(() => {
        const full = queryClient.getQueryData<SearchVideoItem>(['video', item.id]);
        if (full) usePlayerStore.getState().hydrateTrack(item.id, full);
      });
  };

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Search</h1>

      <div
        ref={containerRef}
        className="relative w-full z-20"
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitQ(input);
              setIsFocused(false);
            }
          }}
          placeholder="Paste URL or search keywords..."
          className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
          role="combobox"
          aria-expanded={showSuggestions && !!suggestions?.length}
          aria-controls="search-suggestions"
        />

        {showSuggestions && suggestions && suggestions.length > 0 && (
          <ul
            id="search-suggestions"
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden py-2"
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                role="option"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  commitQ(suggestion);
                  setIsFocused(false);
                }}
                className="px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer text-sm font-medium"
              >
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        {isLoading && (
          <div className="py-12 flex justify-center text-zinc-500">
            <ImSpinner8 className="animate-spin h-8 w-8 text-blue-500" />
          </div>
        )}

        {isError && (
          <div className="py-8 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
            <p className="font-semibold">Search failed</p>
            <p className="text-sm mt-1 opacity-80">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        )}

        {!isLoading && !isError && data && 'items' in data && (
          <div className="space-y-3">
            {data.items.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No results found</div>
            ) : (
              data.items.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="group flex items-center gap-4 p-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                >
                  <button
                    onClick={() => (item.type === 'video' ? handlePlayNow(item) : navigate(`/playlist/${item.id}`))}
                    className="relative w-32 shrink-0 aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-lg overflow-hidden"
                  >
                    {item.thumbnails?.[0] && (
                      <img
                        src={item.thumbnails[0].url}
                        alt=""
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    {item.type === 'video' && item.duration > 0 && (
                      <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {formatDuration(item.duration)}
                      </span>
                    )}
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="text-sm font-semibold line-clamp-2 leading-tight">{item.title}</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      {item.uploaderName}
                      {item.type === 'playlist' ? ` · ${item.videoCount} tracks` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.type === 'video' && (
                      <>
                        <button
                          onClick={() => playNextInQueue(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        >
                          Play next
                        </button>
                        <button
                          onClick={() => addToQueue(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        >
                          Queue
                        </button>
                      </>
                    )}
                    <Link
                      to={item.type === 'video' ? `/video/${item.id}` : `/playlist/${item.id}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
