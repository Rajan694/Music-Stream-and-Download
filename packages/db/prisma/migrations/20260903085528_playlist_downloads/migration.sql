-- AlterTable
ALTER TABLE "DownloadItem" ADD COLUMN     "fileSize" INTEGER;

-- AlterTable
ALTER TABLE "DownloadJob" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'video',
ADD COLUMN     "playlistId" TEXT,
ALTER COLUMN "videoId" DROP NOT NULL;
