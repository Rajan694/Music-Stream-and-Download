/**
 * FilenameService
 *
 * Transforms a raw media title (e.g. "Artist - Song (Official Video) [HD]") into a
 * safe, normalized filesystem name. The §15 pipeline is implemented as discrete,
 * pure steps so each can be tested independently. All functions are pure and
 * deterministic — no filesystem or IO side effects.
 */

// Windows reserved device names must never be used as a file base name.
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

/**
 * Step 1 — Strip common release/documentary suffixes.
 * E.g. " - Official Video", " (Official Audio)", " [Official Video]".
 */
export function stripSuffixes(input: string): string {
  return input
    .replace(
      /\s*[-–—]\s*(official (video|audio|music video|lyric video|audio)|official)$/gi,
      "",
    )
    .replace(
      /\s*\((official (video|audio|lyric video|music video|visualizer))\)/gi,
      "",
    )
    .replace(/\s*\[(official (video|audio|lyric video|visualizer))\]/gi, "");
}

/**
 * Step 2 — Strip bracketed / parenthesized annotations entirely.
 * E.g. " (Official Video)" or " [HD]" become removed.
 */
export function stripBrackets(input: string): string {
  return input
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\{[^}]*\}/g, "");
}

/**
 * Step 3 — Strip a leading "Artist - " prefix.
 * The heuristic: split on the FIRST " - " and keep the remainder.
 * Some titles contain no artist prefix — they're returned unchanged.
 */
export function stripArtistPrefix(input: string): string {
  const trimmed = input.trim();
  const idx = trimmed.indexOf(" - ");
  if (idx <= 0) return trimmed;

  // Guard: don't strip if it looks like a number range "2020 - 2024"
  const artist = trimmed.slice(0, idx);
  if (/^[\d\s,.]*$/.test(artist.trim()) && artist.trim().length < 10) {
    return trimmed;
  }

  return trimmed.slice(idx + 3).trim();
}

/**
 * Step 4 — Collapse runs of whitespace into a single space.
 */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Step 5 — Sanitize for the filesystem.
 * Strips characters illegal on common filesystems, control chars, trailing
 * dots/spaces, and Windows reserved names. Caps output at 180 UTF-8 bytes.
 */
export function sanitizeFs(input: string): string {
  // Remove characters illegal on Windows and most Unix filesystems.
  // Preserve a trailing space we then strip to keep valid filenames.
  let result = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "") // control characters
    .replace(/[<>:"/\\|?*]/g, "") // illegal path characters
    .replace(/[.]+\s*$/, "") // trailing dots and spaces
    .replace(/\s+$/, "");

  // Handle Windows reserved device names: prefix if the whole name matches.
  if (WINDOWS_RESERVED_NAMES.has(result.toUpperCase())) {
    result = `_${result}`;
  }

  // Cap at 180 bytes, cutting on a UTF-8 character boundary.
  if (utf8Length(result) > 180) {
    let trimmed = "";
    for (const ch of result) {
      if (utf8Length(trimmed + ch) > 180) break;
      trimmed += ch;
    }
    result = trimmed.replace(/\s+$/, "");
  }

  return result.trim() || "untitled";
}

/** UTF-8 byte length — no Node or DOM dependency, works in any JS engine. */
export function utf8Length(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i)!;
    if (code > 0x7f) {
      if (code > 0xffff) i++; // surrogate pair
      bytes += code > 0x7ff ? (code > 0xffff ? 4 : 3) : 2;
    } else {
      bytes++;
    }
  }
  return bytes;
}

/** Step 6 — Append a file extension. */
export function appendExt(base: string, ext: string): string {
  const cleanExt = ext.replace(/^\./, "");
  return `${base}.${cleanExt}`;
}

/**
 * Convenience: run the full §15 pipeline.
 * Keeps the individual steps public and testable while offering a single
 * entry point for callers.
 */
export function buildCleanFilename(
  title: string,
  extension: string,
  opts: { keepArtistPrefix?: boolean } = {},
): string {
  let name = stripSuffixes(title);
  name = stripBrackets(name);
  if (!opts.keepArtistPrefix) name = stripArtistPrefix(name);
  name = collapseWhitespace(name);
  name = sanitizeFs(name);
  return appendExt(name, extension);
}

export const FilenameService = {
  stripSuffixes,
  stripBrackets,
  stripArtistPrefix,
  collapseWhitespace,
  sanitizeFs,
  appendExt,
  buildCleanFilename,
};
