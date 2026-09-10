import { usePlayerStore } from "../stores/player.store";
import { Link } from "react-router";
import { useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Download, ListMusic, X } from "lucide-react";
import { SeekBar } from "../components/player/SeekBar";
import { useAuthStore } from "../stores/auth.store";

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function PlayerPage() {
  const {
    currentTrack,
    queue,
    queueIndex,
    isPlaying,
    currentTime,
    duration,
    repeatMode,
    isLoadingNext,
    playNext,
    playPrevious,
    toggleRepeat,
    setPlaying,
    removeFromQueue,
    clearQueue,
  } = usePlayerStore();

  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-medium text-zinc-400">No track playing</h2>
        <Link
          to="/search"
          className="px-5 py-2.5 bg-accent-primary text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
        >
          Find something to play
        </Link>
      </div>
    );
  }

  return (
    <div className="relative max-w-xl mx-auto flex flex-col items-center justify-center py-6">
      {/* Dynamic blurred background backdrop */}
      {currentTrack.thumbnails?.[0] && (
        <div 
          className="absolute inset-0 -z-10 blur-[120px] opacity-20 bg-center bg-cover scale-150 pointer-events-none"
          style={{ backgroundImage: `url(${currentTrack.thumbnails[0].url})` }}
        />
      )}

      {/* Modern High-End Artwork Display */}
      <div className="relative w-64 h-64 md:w-80 md:h-80 mb-8 rounded-2xl overflow-hidden shadow-2xl border border-white/10 group">
        {currentTrack.thumbnails?.[0] && (
          <img
            src={currentTrack.thumbnails[0].url}
            alt={currentTrack.title}
            className="object-cover w-full h-full"
          />
        )}
      </div>

      <div className="text-center w-full px-4 mb-6">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white line-clamp-1 mb-1">
          {currentTrack.title}
        </h1>
        <p className="text-sm font-medium text-zinc-400">{currentTrack.uploaderName}</p>
      </div>

      <div className="w-full px-4 space-y-6">
        <div>
          <SeekBar />
          <div className="flex justify-between text-xs text-zinc-500 font-medium tabular-nums mt-2">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration || currentTrack.duration)}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-between px-6">
          <button
            onClick={toggleRepeat}
            className={`p-2 transition-colors ${repeatMode !== "off" ? "text-accent-primary" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {repeatMode === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>

          <button
            onClick={playPrevious}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
          >
            <SkipBack size={24} fill="currentColor" />
          </button>

          <button
            onClick={() => setPlaying(!isPlaying)}
            className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-white/10"
          >
            {isPlaying ? (
              <Pause size={24} fill="currentColor" />
            ) : (
              <Play size={24} fill="currentColor" className="translate-x-0.5" />
            )}
          </button>

          <button
            onClick={playNext}
            disabled={isLoadingNext}
            className="p-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <SkipForward size={24} fill="currentColor" />
          </button>

          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`p-2 transition-colors ${isQueueOpen ? "text-accent-primary" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            <ListMusic size={20} />
          </button>
        </div>

        {/* Drawer for Up Next */}
        {isQueueOpen && (
          <div className="bg-background-1 border border-white/5 rounded-xl overflow-hidden mt-6">
            <div className="p-3 border-b border-white/5 flex justify-between items-center text-xs font-semibold text-zinc-400">
              <span>Up Next ({queue.length})</span>
              <button onClick={clearQueue} className="text-red-400 hover:underline">Clear</button>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
              {queue.map((t, idx) => (
                <div
                  key={`${t.id}-${idx}`}
                  className={`flex items-center justify-between p-3 text-xs ${
                    idx === queueIndex ? "text-accent-primary bg-white/5 font-semibold" : "text-zinc-300"
                  }`}
                >
                  <span className="truncate flex-1 pr-2">{idx + 1}. {t.title}</span>
                  <button onClick={() => removeFromQueue(idx)} className="text-zinc-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
