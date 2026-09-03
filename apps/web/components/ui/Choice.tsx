"use client";

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
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {description && (
        <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
      )}
      <div
        className="mt-2 grid grid-cols-3 gap-2"
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
            className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
              value === option
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
            }`}
          >
            {render(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
