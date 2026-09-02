import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";

export { PrismaClient } from "./generated/client.js";

/**
 * Creates a PrismaClient wired to the PostgreSQL database via the pg driver
 * adapter (required by Prisma 7 for direct connections). The datasource URL
 * is read from `process.env.DATABASE_URL`, falling back to a local default.
 */
export function createPrismaClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5436/music?schema=public";

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
