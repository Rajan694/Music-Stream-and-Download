import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "@music/db";

export async function cleanupOrphanTempFiles(prisma: PrismaClient): Promise<void> {
  const baseDir =
    process.env.MEDIA_TEMP_DIR ||
    process.env.WORKER_MEDIA_TEMP_DIR ||
    "/tmp/music-media";

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return;
  }

  const now = Date.now();
  const ONE_HOUR = 60 * 60_000;

  const activeIds = new Set(
    (
      await prisma.downloadJob.findMany({
        where: {
          state: { in: ["queued", "resolving", "downloading", "transcoding"] },
        },
        select: { id: true },
      })
    ).map((job) => job.id),
  );

  let cleaned = 0;
  for (const entry of entries) {
    if (activeIds.has(entry)) continue;

    const dirPath = join(baseDir, entry);
    try {
      const info = await stat(dirPath);
      if (!info.isDirectory()) continue;
      if (now - info.mtimeMs < ONE_HOUR) continue;

      await rm(dirPath, { recursive: true, force: true });
      cleaned++;

      await prisma.downloadJob.updateMany({
        where: { id: entry, filePath: { not: null } },
        data: { filePath: null },
      });

      await prisma.downloadItem.updateMany({
        where: { jobId: entry, filePath: { not: null } },
        data: { filePath: null },
      });
    } catch {
      // best-effort
    }
  }

  if (cleaned > 0) {
    console.info(`Cleaned ${cleaned} orphaned temp dir(s)`);
  }
}