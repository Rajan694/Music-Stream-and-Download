import { Global, Module } from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@music/db';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => createPrismaClient(),
    },
  ],
  exports: [PrismaClient],
})
export class DatabaseModule {}
