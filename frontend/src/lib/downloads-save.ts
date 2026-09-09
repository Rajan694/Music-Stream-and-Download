import { apiClient } from "./api";

/**
 * A completed job can be observed by more than one place at once — the download
 * dialog and the downloads list both poll — and each observer would otherwise
 * kick off its own save. Module scope keeps one save per job per page load.
 */
const saved = new Set<string>();

export function hasSavedDownload(jobId: string): boolean {
  return saved.has(jobId);
}

/**
 * Hands the finished file to the browser. The file endpoints authenticate off a
 * `token` query param, and a job that ran for minutes may well have outlived the
 * access token that started it, so refresh before building the URL.
 */
export async function saveCompletedDownload(
  jobId: string,
  kind: "video" | "playlist" = "video",
): Promise<void> {
  if (saved.has(jobId)) return;
  saved.add(jobId);

  try {
    await apiClient.refresh();
  } catch {
    // Refresh failed — try the existing token rather than dropping the file.
  }

  const url =
    kind === "playlist"
      ? apiClient.playlistArchiveUrl(jobId)
      : apiClient.downloadFileUrl(jobId);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
