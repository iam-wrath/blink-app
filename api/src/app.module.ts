import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { FramesService } from './frames.service.js';
import { PrismaService } from './prisma.service.js';

@Module({
  controllers: [AppController],
  providers: [FramesService, PrismaService],
})
export class AppModule {}