"use client";
import { motion } from "framer-motion";

export function Choice<T extends string>({
  label,
  options,
  value,
  onSelect,
  render,
  description,
}: {
  label: string;
  options: readonly T[];
  value: T | undefined;
  onSelect: (value: T) => void;
  render: (value: T) => string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        {label}
      </p>
      {description && (
        <p className="text-xs text-zinc-400 mb-3">{description}</p>
      )}
      <div
        className="relative grid grid-cols-3 gap-1 bg-zinc-100 dark:bg-background-2 p-1 rounded-xl"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onSelect(option)}
            className={`relative z-10 py-2 rounded-lg text-sm font-medium transition-colors ${
              value === option ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            }`}
          >
            {value === option && (
              <motion.div
                layoutId={`choice-bg-${label}`}
                className="absolute inset-0 bg-white dark:bg-white/10 rounded-lg -z-10 border border-zinc-200 dark:border-white/5 shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  );
}