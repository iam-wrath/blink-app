import { BadGatewayException, BadRequestException, GatewayTimeoutException, Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from './prisma.service.js';

const DETECTOR_URL = process.env.DETECTOR_URL ?? 'http://localhost:8000';
// live IRSA searches can be slow; give up after this long (default 5 minutes)
const DETECTOR_TIMEOUT_MS = Number(process.env.DETECTOR_TIMEOUT_MS ?? 300_000);

@Injectable()
export class FramesService {
  constructor(private prisma: PrismaService) {}

  async frames(ra: number, dec: number, fov: number, detector: string, mode: string, coadd = 'none') {
    // testing switch: returns the fake example, no detector needed
    if (process.env.USE_FAKE === 'true') {
      return JSON.parse(
        readFileSync(join(process.cwd(), '..', 'contract', 'example_frames.json'), 'utf8'),
      );
    }

    // coadd is only added to the key when used, so searches cached before it existed stay valid
    const key = [ra.toFixed(4), dec.toFixed(4), fov, detector, mode, ...(coadd === 'none' ? [] : [coadd])].join('|');
    const hit = await this.prisma.searchCache.findUnique({ where: { key } });
    if (hit) return JSON.parse(hit.response);

    let r: Response;
    try {
      r = await fetch(`${DETECTOR_URL}/frames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ra, dec, fovDeg: fov, detector, mode, coadd }),
        signal: AbortSignal.timeout(DETECTOR_TIMEOUT_MS),
      });
    } catch (e) {
      if ((e as Error).name === 'TimeoutError') {
        throw new GatewayTimeoutException('The IRSA search timed out. Try a smaller field of view, or try again later.');
      }
      throw new BadGatewayException('The frame service is not reachable, and this search is not cached yet.');
    }
    if (!r.ok) {
      // pass the frame service's own message through (FastAPI puts it in "detail")
      const body = await r.json().catch(() => null);
      const detail = typeof body?.detail === 'string' ? body.detail : `The frame service returned an error (${r.status}).`;
      throw r.status === 400 ? new BadRequestException(detail) : new BadGatewayException(detail);
    }
    const data = await r.json();
    // don't cache "no images" answers: a later data release (or IRSA coming back online) may have some
    if (!data?.frames?.length) return data;

    await this.prisma.searchCache.upsert({
      where: { key },
      update: { response: JSON.stringify(data) },
      create: { key, response: JSON.stringify(data) },
    });
    return data;
  }
}