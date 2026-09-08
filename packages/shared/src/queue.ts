import { z } from "zod";

export const DOWNLOADS_QUEUE = "downloads";

export const DownloadJobPayloadSchema = z.object({
  jobId: z.string(),
  kind: z.enum(["video", "playlist"]),
});

export type DownloadJobPayload = z.infer<typeof DownloadJobPayloadSchema>;