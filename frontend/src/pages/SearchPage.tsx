import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchVideoItem } from '@music/shared';
import { useUIStore } from '../stores/ui.store';
import { apiClient } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import { usePlayerStore } from '../stores/player.store';
import { Search, Play, MoreVertical, ListPlus, Radio } from 'lucide-react';
import { Spinner, ErrorState } from '../components/ui/States';

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

  const [input, setInput] = useState(q);
  const pushedRef = useRef(q);
  const debouncedInput = useDebounced(input, 400);

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
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-white">Search</h1>
        <p className="text-xs text-zinc-400">Find your favorite music, artists, or paste a link</p>
      </div>

      <div
        ref={containerRef}
        className="relative w-full z-20"
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setIsFocused(false);
          }
        }}
      >
        <div className="relative flex items-center">
          <Search className="absolute left-4 text-zinc-400" size={18} />
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
            placeholder="Search songs, albums, artists..."
            className="w-full bg-background-1 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent-primary/50 focus:ring-2 focus:ring-accent-primary/20 transition-all font-medium"
            role="combobox"
            aria-expanded={showSuggestions && !!suggestions?.length}
            aria-controls="search-suggestions"
          />
        </div>

        {showSuggestions && suggestions && suggestions.length > 0 && (
          <ul
            id="search-suggestions"
            className="absolute top-full left-0 right-0 mt-2 bg-background-1/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-30"
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
                className="px-4 py-2.5 hover:bg-white/5 cursor-pointer text-xs font-medium text-zinc-300 hover:text-white flex items-center gap-3 transition-colors"
              >
                <Search size={14} className="text-zinc-500" />
                {suggestion}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8">
        {isLoading && <Spinner label="Searching..." />}

        {isError && (
          <ErrorState
            title="Search failed"
            message={error instanceof Error ? error.message : 'Unknown error'}
          />
        )}

        {!isLoading && !isError && data && 'items' in data && (
          <div className="space-y-2">
            {data.items.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">No results found</div>
            ) : (
              data.items.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="group flex items-center gap-4 p-2 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
                >
                  <button
                    onClick={() => (item.type === 'video' ? handlePlayNow(item) : navigate(`/playlist/${item.id}`))}
                    className="relative w-14 h-14 shrink-0 bg-background-2 rounded-lg overflow-hidden flex items-center justify-center group-hover:shadow-lg transition-all"
                  >
                    {item.thumbnails?.[0] && (
                      <img
                        src={item.thumbnails[0].url}
                        alt=""
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play size={20} className="text-white fill-white" />
                    </div>
                  </button>

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="text-sm font-semibold truncate text-zinc-100 group-hover:text-white">{item.title}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5 truncate">
                      {item.uploaderName}
                      {item.type === 'playlist' ? ` · ${item.videoCount} tracks` : ''}
                      {item.type === 'video' && item.duration > 0 ? ` · ${formatDuration(item.duration)}` : ''}
                    </p>
                  </div>

                  {/* Actions for Desktop and Mobile */}
                  <div className="flex items-center gap-1 shrink-0">
                    {item.type === 'video' && (
                      <>
                        <button
                          onClick={() => playNextInQueue(item)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors hidden sm:flex"
                          title="Play Next"
                        >
                          <Radio size={16} />
                        </button>
                        <button
                          onClick={() => addToQueue(item)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                          title="Add to Queue"
                        >
                          <ListPlus size={16} />
                        </button>
                      </>
                    )}
                    <Link
                      to={item.type === 'video' ? `/video/${item.id}` : `/playlist/${item.id}`}
                      className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                      title="Details"
                    >
                      <MoreVertical size={16} />
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
