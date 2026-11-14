import { Controller, Get, Query } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FramesService } from './frames.service.js';

@Controller()
export class AppController {
  constructor(private readonly svc: FramesService) {}

  @Get('frames')
  frames(
    @Query('ra') ra: string,
    @Query('dec') dec: string,
    @Query('fov') fov = '0.1',
    @Query('detector') detector = 'D2',
    @Query('mode') mode = 'raw',
  ) {
    return this.svc.frames(parseFloat(ra), parseFloat(dec), parseFloat(fov), detector, mode);
  }

  @Get('targets')
  targets() {
    return JSON.parse(
      readFileSync(join(process.cwd(), '..', 'contract', 'targets.json'), 'utf8'),
    );
  }
}