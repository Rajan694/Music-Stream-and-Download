import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ImSpinner8 } from "react-icons/im";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api";
import { formatDuration } from "../lib/format";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [searchTrigger, setSearchTrigger] = useState("");
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search", searchTrigger],
    queryFn: async () => {
      if (!searchTrigger) return null;
      const res = await apiClient.search(searchTrigger);
      if (res.intent === "video") {
        navigate(`/video/${res.id}`);
        return { intent: "navigating" as const };
      }
      if (res.intent === "playlist") {
        navigate(`/playlist/${res.id}`);
        return { intent: "navigating" as const };
      }
      return res.data;
    },
    enabled: !!searchTrigger,
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchTrigger(query.trim());
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Search</h1>

      <form onSubmit={onSubmit} className="relative field-sizing-content w-full">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paste URL or search keywords..."
          className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          Search
        </button>
      </form>

      <div className="mt-8">
        {isLoading && (
          <div className="py-12 flex justify-center text-zinc-500">
            <ImSpinner8 className="animate-spin h-8 w-8 text-blue-500" />
          </div>
        )}

        {isError && (
          <div className="py-8 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
            <p className="font-semibold">Search failed</p>
            <p className="text-sm mt-1 opacity-80">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {!isLoading && !isError && data && "items" in data && (
          <div className="space-y-4">
            {data.items.length === 0 ? (
              <div className="py-12 text-center text-zinc-500">No results found</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {data.items.map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    to={
                      item.type === "video"
                        ? `/video/${item.id}`
                        : `/playlist/${item.id}`
                    }
                    className="group flex flex-col gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="aspect-video bg-zinc-200 dark:bg-zinc-800 rounded-lg overflow-hidden relative">
                      {item.thumbnails?.[0] && (
                        <img
                          src={item.thumbnails[0].url}
                          alt=""
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                        />
                      )}
                      {item.type === "video" && item.duration > 0 && (
                        <span className="absolute bottom-2 right-2 bg-black/80 backdrop-blur text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold line-clamp-2 leading-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        {item.uploaderName}
                        {item.type === "playlist"
                          ? ` · ${item.videoCount} tracks`
                          : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}