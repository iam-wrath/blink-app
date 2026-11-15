import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module.js';

// HOST: 127.0.0.1 by default (this machine only). Set HOST=0.0.0.0 to share the API on your network.
// CORS_ORIGIN: comma-separated list of sites allowed to call the API from a browser; default * (public, read-only).
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
const DETECTOR_URL = process.env.DETECTOR_URL ?? 'http://localhost:8000';
// /frames/<10-hex search key>/<key>_raw_001.png, as written by detector/main.py
const FRAME_PNG = /^\/frames\/[0-9a-f]{10}\/[0-9a-f]{10}_(raw|diff)_\d{3}\.png$/;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // PNGs are shown by the web app on another origin
    next();
  });
  // read-only API: browsers may only GET
  app.enableCors({ origin: CORS_ORIGIN?.length ? CORS_ORIGIN : '*', methods: ['GET', 'HEAD'] });
  app.setGlobalPrefix('api');
  // Behind a reverse proxy (nginx in docker-compose) set TRUST_PROXY=1, so the rate limit sees each
  // client's own address from X-Forwarded-For instead of the proxy's.
  // Accepts a number of proxy hops, "true" (trust all), or a list of proxy addresses.
  const tp = process.env.TRUST_PROXY?.trim();
  if (tp && tp !== 'false') app.set('trust proxy', tp === 'true' ? true : Number(tp) || tp);
  // Only the generated PNGs are public, not the downloaded FITS files or anything else in data/.
  // seed/cache (the five challenge targets, shipped in the repo) is the fallback for files not in data/cache.
  for (const dir of [join(process.cwd(), '..', 'data', 'cache'), join(process.cwd(), '..', 'seed', 'cache')]) {
    app.useStaticAssets(dir, { prefix: '/data/cache/', index: false, dotfiles: 'deny', maxAge: '1d' });
  }
  // Last resort: ask the frame service. When it runs on its own disk (e.g. on Render each service has its
  // own volume), PNGs from new searches only exist there. Only exact frame file names are passed on.
  app.use('/data/cache/', async (req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !FRAME_PNG.test(req.path)) return next();
    try {
      const r = await fetch(`${DETECTOR_URL}/data/cache${req.path}`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return next();
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(await r.arrayBuffer()));
    } catch {
      next();
    }
  });
  await app.listen(PORT, HOST);
}
bootstrap();
