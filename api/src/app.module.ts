import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { FramesService } from './frames.service.js';
import { PrismaService } from './prisma.service.js';

// Per-client rate limit on /api routes (the PNGs under /data/cache are static files and not counted).
// RATE_LIMIT requests per minute per IP address, default 120.
const RATE_LIMIT = Number(process.env.RATE_LIMIT ?? 120);

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: RATE_LIMIT }])],
  controllers: [AppController],
  providers: [FramesService, PrismaService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
