-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "PlayEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uploaderName" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "msPlayed" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "clientPlatform" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayEvent_playedAt_idx" ON "PlayEvent"("playedAt");

-- CreateIndex
CREATE INDEX "PlayEvent_userId_playedAt_idx" ON "PlayEvent"("userId", "playedAt");

-- CreateIndex
CREATE INDEX "PlayEvent_videoId_playedAt_idx" ON "PlayEvent"("videoId", "playedAt");

-- AddForeignKey
ALTER TABLE "PlayEvent" ADD CONSTRAINT "PlayEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
