import { useState, useCallback } from "react";
import { usePlayerStore } from "../../stores/player.store";

interface SeekBarProps {
  className?: string;
  variant?: "default" | "mini";
}

export function SeekBar({ className = "", variant = "default" }: SeekBarProps) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const total = duration || currentTrack?.duration || 0;
  const [dragValue, setDragValue] = useState<number | null>(null);

  const displayValue = dragValue ?? currentTime;
  const progress = total > 0 ? (displayValue / total) * 100 : 0;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDragValue(Number(e.target.value));
    },
    [],
  );

  const handlePointerDown = useCallback(() => {
    //
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const value = Number((e.target as HTMLInputElement).value);
      setDragValue(null);
      seekTo(value);
    },
    [seekTo],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const value = Number((e.target as HTMLInputElement).value);
        setDragValue(null);
        seekTo(value);
      }
    },
    [seekTo],
  );

  if (variant === "mini") {
    return (
      <div className={`relative h-1.5 group ${className}`}>
        <div className="absolute inset-0 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 group-hover:bg-blue-400 rounded-full transition-colors"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={displayValue}
          onChange={handleChange}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Seek"
        />
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <input
        type="range"
        min={0}
        max={total}
        step={0.1}
        value={displayValue}
        onChange={handleChange}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        className="w-full h-1.5 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-full cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
          [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:relative
          [&::-webkit-slider-thumb]:z-10
          [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500
          [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md"
        aria-label="Seek"
      />
    </div>
  );
}
