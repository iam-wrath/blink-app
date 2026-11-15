import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
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
    const r = parseFloat(ra);
    const d = parseFloat(dec);
    const f = parseFloat(fov);
    if (!Number.isFinite(r) || !Number.isFinite(d) || !Number.isFinite(f)) {
      throw new BadRequestException('ra, dec and fov must be numbers, e.g. ?ra=133.7951&dec=-7.2451&fov=0.1');
    }
    if (mode !== 'raw' && mode !== 'diff') {
      throw new BadRequestException('mode must be raw or diff');
    }
    return this.svc.frames(r, d, f, detector, mode);
  }

  @Get('targets')
  targets() {
    return JSON.parse(
      readFileSync(join(process.cwd(), '..', 'contract', 'targets.json'), 'utf8'),
    );
  }
}