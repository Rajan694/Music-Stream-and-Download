"use client";

import { usePlayerStore } from "../../stores/player.store";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  MdDownload,
  MdPause,
  MdPlayArrow,
  MdSkipNext,
  MdSkipPrevious,
} from "react-icons/md";

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function GlobalMiniPlayer() {
  const pathname = usePathname();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    setPlaying,
    playNext,
    playPrevious,
  } = usePlayerStore();

  // Hide on full player page or if no track
  if (!currentTrack || pathname === "/player") return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mini-player fixed bottom-16 lg:bottom-0 left-0 right-0 z-50 flex flex-col bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-4px_24px_rgba(0,0,0,0.1)]">
      {/* Progress Bar */}
      <div className="h-1 bg-zinc-200 dark:bg-zinc-800 w-full cursor-pointer relative group">
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 group-hover:bg-blue-400 transition-colors"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between px-4 h-16 max-w-7xl mx-auto w-full">
        {/* Track Info */}
        <Link
          href="/player"
          className="flex items-center gap-3 w-1/3 min-w-0 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 p-2 -ml-2 rounded-lg cursor-pointer"
        >
          <div className="relative h-10 w-10 shrink-0 bg-zinc-800 rounded-md overflow-hidden">
            {currentTrack.thumbnails?.[0]?.url && (
              <img
                src={currentTrack.thumbnails[0].url}
                alt=""
                className="object-cover w-full h-full"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium truncate">
              {currentTrack.title}
            </h4>
            <p className="text-xs text-zinc-500 truncate">
              {currentTrack.uploaderName}
            </p>
          </div>
        </Link>

        {/* Controls */}
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="flex items-center gap-4">
            <button
              onClick={playPrevious}
              className="p-2 text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              <MdSkipPrevious className="w-5 h-5" />
            </button>

            <button
              onClick={() => setPlaying(!isPlaying)}
              className="p-2 h-10 w-10 flex items-center justify-center bg-black text-white dark:bg-white dark:text-black rounded-full hover:scale-105 transition-transform"
            >
              {isPlaying ? (
                <MdPause className="w-5 h-5" />
              ) : (
                <MdPlayArrow className="w-5 h-5 translate-x-0.5" />
              )}
            </button>

            <button
              onClick={playNext}
              className="p-2 text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white transition-colors"
            >
              <MdSkipNext className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right side controls / Time */}
        <div className="flex items-center justify-end gap-3 w-1/3 text-xs text-zinc-500 font-medium tabular-nums">
          <button
            onClick={() => globalThis.openDownloadDialog?.()}
            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-500 transition-colors"
            aria-label="Download current track"
          >
            <MdDownload className="w-4 h-4" />
          </button>
          <span>
            {formatTime(currentTime)} /{" "}
            {formatTime(duration || currentTrack.duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
