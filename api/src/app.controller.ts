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
    @Query('coadd') coadd = 'none',
  ) {
    const r = parseFloat(ra);
    const d = parseFloat(dec);
    const f = parseFloat(fov);
    if (!Number.isFinite(r) || !Number.isFinite(d) || !Number.isFinite(f)) {
      throw new BadRequestException('ra, dec and fov must be numbers, e.g. ?ra=133.7951&dec=-7.2451&fov=0.1');
    }
    if (r < 0 || r > 360 || d < -90 || d > 90 || f <= 0 || f > 2) {
      throw new BadRequestException('ra must be 0 to 360, dec -90 to 90, and fov above 0 and at most 2 (degrees)');
    }
    if (typeof detector !== 'string' || !/^D[1-6]$/.test(detector)) {
      throw new BadRequestException('detector must be one of D1 to D6');
    }
    if (mode !== 'raw' && mode !== 'diff') {
      throw new BadRequestException('mode must be raw or diff');
    }
    if (coadd !== 'none' && coadd !== 'visit') {
      throw new BadRequestException('coadd must be none or visit');
    }
    return this.svc.frames(r, d, f, detector, mode, coadd);
  }

  @Get('targets')
  targets() {
    return JSON.parse(
      readFileSync(join(process.cwd(), '..', 'contract', 'targets.json'), 'utf8'),
    );
  }
}