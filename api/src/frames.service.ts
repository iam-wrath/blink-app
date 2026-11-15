import { BadGatewayException, BadRequestException, GatewayTimeoutException, Injectable, Logger, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from './prisma.service.js';

const DETECTOR_URL = process.env.DETECTOR_URL ?? 'http://localhost:8000';
const DETECTOR_TOKEN = process.env.DETECTOR_TOKEN ?? '';
// live IRSA searches can be slow; give up after this long (default 5 minutes)
const DETECTOR_TIMEOUT_MS = Number(process.env.DETECTOR_TIMEOUT_MS ?? 300_000);

// how many different uncached searches may run at once (each can download many FITS files)
const MAX_CONCURRENT_SEARCHES = Number(process.env.MAX_CONCURRENT_SEARCHES ?? 2);

// coadd is only added to the key when used, so searches cached before it existed stay valid
const cacheKey = (ra: number, dec: number, fov: number, detector: string, mode: string, coadd = 'none') =>
  [ra.toFixed(4), dec.toFixed(4), fov, detector, mode, ...(coadd === 'none' ? [] : [coadd])].join('|');

type SeedEntry = { query: { ra: number; dec: number; fov: number; detector: string; mode: string; coadd?: string }; response: unknown };

@Injectable()
export class FramesService implements OnModuleInit {
  private inFlight = new Map<string, Promise<unknown>>();
  private readonly log = new Logger(FramesService.name);

  constructor(private prisma: PrismaService) {}

  // seed/search-cache.json (made by scripts/export_seed.py) holds the five challenge targets' searches,
  // so a fresh server shows them without IRSA. Entries already in the cache are left alone.
  async onModuleInit() {
    const file = join(process.cwd(), '..', 'seed', 'search-cache.json');
    if (!existsSync(file)) return;
    try {
      const entries = JSON.parse(readFileSync(file, 'utf8')) as SeedEntry[];
      let added = 0;
      for (const { query: q, response } of entries) {
        const key = cacheKey(q.ra, q.dec, q.fov, q.detector, q.mode, q.coadd);
        if (await this.prisma.searchCache.findUnique({ where: { key } })) continue;
        await this.prisma.searchCache.create({ data: { key, response: JSON.stringify(response) } });
        added++;
      }
      if (added) this.log.log(`Seeded ${added} cached searches from seed/search-cache.json`);
    } catch (e) {
      this.log.warn(`Could not load seed/search-cache.json: ${(e as Error).message}`);
    }
  }

  async frames(ra: number, dec: number, fov: number, detector: string, mode: string, coadd = 'none') {
    // testing switch: returns the fake example, no detector needed
    if (process.env.USE_FAKE === 'true') {
      return JSON.parse(
        readFileSync(join(process.cwd(), '..', 'contract', 'example_frames.json'), 'utf8'),
      );
    }

    const key = cacheKey(ra, dec, fov, detector, mode, coadd);
    const hit = await this.prisma.searchCache.findUnique({ where: { key } });
    if (hit) return JSON.parse(hit.response);

    // An uncached search makes the frame service download from IRSA and render images, so:
    // the same search asked twice at once runs once, and only a few different ones run at a time.
    const running = this.inFlight.get(key);
    if (running) return running;
    if (this.inFlight.size >= MAX_CONCURRENT_SEARCHES) {
      throw new ServiceUnavailableException('Blink is busy with other new searches. Try again in a minute, or pick a preset target.');
    }
    const job = this.search(key, ra, dec, fov, detector, mode, coadd).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  private async search(key: string, ra: number, dec: number, fov: number, detector: string, mode: string, coadd: string) {
    let r: Response;
    try {
      r = await fetch(`${DETECTOR_URL}/frames`, {
        method: 'POST',
        // DETECTOR_TOKEN: shared secret, needed when the frame service has a public address (Render)
        headers: { 'Content-Type': 'application/json', ...(DETECTOR_TOKEN ? { 'X-Blink-Token': DETECTOR_TOKEN } : {}) },
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