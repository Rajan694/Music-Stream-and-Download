import { usePlayerStore } from "../stores/player.store";
import { Link } from "react-router";
import { useState } from "react";
import {
  MdClose,
  MdDownload,
  MdPause,
  MdPlayArrow,
  MdQueueMusic,
  MdRepeat,
  MdRepeatOne,
  MdShuffle,
  MdSkipNext,
  MdSkipPrevious,
} from "react-icons/md";

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
    isShuffle,
    playNext,
    playPrevious,
    toggleRepeat,
    toggleShuffle,
    setPlaying,
    removeFromQueue,
    clearQueue,
  } = usePlayerStore();

  const [isQueueOpen, setIsQueueOpen] = useState(false);

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
        <h2 className="text-xl font-medium text-zinc-500">No track playing</h2>
        <Link
          to="/search"
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Find something to play
        </Link>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-100px)] flex flex-col justify-center pb-20">
      <div className="relative w-64 h-64 md:w-96 md:h-96 mx-auto mb-10 rounded-full overflow-hidden shadow-2xl border-4 border-zinc-800 bg-black">
        {currentTrack.thumbnails?.[0] && (
          <img
            src={currentTrack.thumbnails[0].url}
            alt={currentTrack.title}
            className={`object-cover w-full h-full opacity-90 transition-all duration-700
                ${isPlaying ? "animate-[spin_10s_linear_infinite]" : ""}`}
          />
        )}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-zinc-950 border border-zinc-800"></div>
      </div>

      <div className="text-center px-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
          {currentTrack.title}
        </h1>
        <p className="text-lg text-zinc-500">{currentTrack.uploaderName}</p>
      </div>

      <div className="px-4 md:px-12 w-full max-w-xl mx-auto">
        <div className="flex justify-between text-xs text-zinc-500 font-medium tabular-nums mb-2">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration || currentTrack.duration)}</span>
        </div>

        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden cursor-pointer">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="flex items-center justify-between mt-8">
          <button
            onClick={toggleShuffle}
            className={`p-2 transition-colors ${isShuffle ? "text-blue-500" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"}`}
          >
            <MdShuffle className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-6">
            <button
              onClick={playPrevious}
              className="p-3 text-zinc-600 hover:text-black dark:text-zinc-300 dark:hover:text-white transition-transform hover:scale-110"
            >
              <MdSkipPrevious className="w-8 h-8" />
            </button>

            <button
              title="Play"
              onClick={() => setPlaying(!isPlaying)}
              className="p-4 bg-black text-white dark:bg-white dark:text-black rounded-full hover:scale-105 transition-transform flex items-center justify-center shadow-lg"
            >
              {isPlaying ? (
                <MdPause className="w-8 h-8" />
              ) : (
                <MdPlayArrow className="w-8 h-8 translate-x-1" />
              )}
            </button>

            <button
              onClick={playNext}
              className="p-3 text-zinc-600 hover:text-black dark:text-zinc-300 dark:hover:text-white transition-transform hover:scale-110"
            >
              <MdSkipNext className="w-8 h-8" />
            </button>
          </div>

          <button
            onClick={toggleRepeat}
            className={`p-2 transition-colors ${repeatMode !== "off" ? "text-blue-500" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"}`}
          >
            {repeatMode === "one" ? (
              <MdRepeatOne className="w-5 h-5" />
            ) : (
              <MdRepeat className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="mt-8 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
          <button
            onClick={() => globalThis.openDownloadDialog?.()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <MdDownload className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-blue-500 flex items-center gap-2"
          >
            <MdQueueMusic className="w-4 h-4" />
            Up Next
          </button>
        </div>

        {isQueueOpen && (
          <div className="mt-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg max-h-64 overflow-y-auto w-full text-sm">
            <div className="p-3 font-semibold flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-50 dark:bg-zinc-900 z-10">
              <span>Queue ({queue.length})</span>
              <button
                onClick={clearQueue}
                className="text-xs text-red-500 hover:underline"
              >
                Clear
              </button>
            </div>
            {queue.length === 0 ? (
              <div className="p-4 text-center text-zinc-500">Empty</div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {queue.map((t, idx) => (
                  <div
                    key={`${t.id}-${idx}`}
                    className={`flex justify-between items-center p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${idx === queueIndex ? "text-blue-500 bg-blue-50 dark:bg-blue-900/10" : ""}`}
                  >
                    <div className="truncate flex-1 pr-4">
                      {idx + 1}. {t.title}
                    </div>
                    <button
                      onClick={() => removeFromQueue(idx)}
                      className="text-zinc-400 hover:text-red-500 p-1"
                    >
                      <MdClose className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}