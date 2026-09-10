import { usePlayerStore } from "../../stores/player.store";
import { useLocation } from "react-router";
import { Link } from "react-router";
import { Play, Pause, SkipBack, SkipForward, Download } from "lucide-react";
import { SeekBar } from "./SeekBar";
import { useAuthStore } from "../../stores/auth.store";

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function GlobalMiniPlayer() {
  const { pathname } = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    setPlaying,
    playNext,
    playPrevious,
  } = usePlayerStore();

  if (!currentTrack || pathname === "/player") return null;

  return (
    <div className="fixed bottom-16 lg:bottom-4 left-0 lg:left-1/2 lg:-translate-x-1/2 right-0 lg:right-auto z-50 lg:w-[600px] w-full px-2 lg:px-0">
      <div className="bg-white/90 dark:bg-background-1/80 backdrop-blur-xl border border-zinc-200 dark:border-white/10 lg:rounded-2xl rounded-xl shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden">
        <div className="px-3 pt-2">
          <SeekBar variant="mini" />
        </div>

        <div className="flex items-center justify-between px-3 h-14 w-full gap-4">
          <Link
            to="/player"
            className="flex items-center gap-3 w-1/3 min-w-0 hover:bg-zinc-100 dark:hover:bg-white/5 p-1.5 -ml-1.5 rounded-lg cursor-pointer group"
          >
            <div className="relative h-9 w-9 shrink-0 bg-zinc-200 dark:bg-background-2 rounded overflow-hidden">
              {currentTrack.thumbnails?.[0]?.url && (
                <img
                  src={currentTrack.thumbnails[0].url}
                  alt=""
                  className="object-cover w-full h-full group-hover:scale-110 transition-transform"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-semibold truncate text-zinc-900 dark:text-zinc-100">
                {currentTrack.title}
              </h4>
              <p className="text-[11px] text-zinc-500 truncate">
                {currentTrack.uploaderName}
              </p>
            </div>
          </Link>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={playPrevious}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <SkipBack size={18} fill="currentColor" />
            </button>

            <button
              onClick={() => setPlaying(!isPlaying)}
              className="w-8 h-8 flex items-center justify-center bg-zinc-900 text-white dark:bg-white dark:text-black rounded-full hover:scale-105 transition-transform"
            >
              {isPlaying ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" className="translate-x-[1px]" />
              )}
            </button>

            <button
              onClick={playNext}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <SkipForward size={18} fill="currentColor" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 w-1/3 text-[11px] text-zinc-500 font-medium tabular-nums">
            {isAuthenticated && (
              <button
                onClick={() => globalThis.openDownloadDialog?.()}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-accent-primary transition-colors"
                aria-label="Download current track"
              >
                <Download size={14} />
              </button>
            )}
            <span>
              {formatTime(currentTime)} /{" "}
              {formatTime(duration || currentTrack.duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
