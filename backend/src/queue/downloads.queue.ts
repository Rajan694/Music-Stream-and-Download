import { Queue } from 'bullmq';
import { DownloadJobPayload, DOWNLOADS_QUEUE } from '@music/shared';
import { Env } from '../config/env.js';

export function createDownloadsQueue(env: Env) {
  return new Queue<DownloadJobPayload>(DOWNLOADS_QUEUE, {
    connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
    defaultJobOptions: {
      attempts: env.QUEUE_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.QUEUE_BACKOFF_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  });
}