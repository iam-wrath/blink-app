import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from './prisma.service.js';

const DETECTOR_URL = process.env.DETECTOR_URL ?? 'http://localhost:8000';

@Injectable()
export class FramesService {
  constructor(private prisma: PrismaService) {}

  async frames(ra: number, dec: number, fov: number, detector: string, mode: string) {
    // testing switch: returns the fake example, no detector needed
    if (process.env.USE_FAKE === 'true') {
      return JSON.parse(
        readFileSync(join(process.cwd(), '..', 'contract', 'example_frames.json'), 'utf8'),
      );
    }

    const key = [ra.toFixed(4), dec.toFixed(4), fov, detector, mode].join('|');
    const hit = await this.prisma.searchCache.findUnique({ where: { key } });
    if (hit) return JSON.parse(hit.response);

    const r = await fetch(`${DETECTOR_URL}/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ra, dec, fovDeg: fov, detector, mode }),
    });
    if (!r.ok) throw new Error('frame service returned ' + r.status);
    const data = await r.json();

    await this.prisma.searchCache.upsert({
      where: { key },
      update: { response: JSON.stringify(data) },
      create: { key, response: JSON.stringify(data) },
    });
    return data;
  }
}