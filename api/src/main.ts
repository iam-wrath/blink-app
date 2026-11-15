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
  // Only the generated PNGs are public, not the downloaded FITS files or anything else in data/
  app.useStaticAssets(join(process.cwd(), '..', 'data', 'cache'), { prefix: '/data/cache/', index: false, dotfiles: 'deny' });
  await app.listen(PORT, HOST);
}
bootstrap();
