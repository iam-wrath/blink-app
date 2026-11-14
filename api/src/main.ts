import { NestFactory } from '@nestjs/core'; 
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  app.useStaticAssets(join(process.cwd(), '..', 'data'), { prefix: '/data'});
  await app.listen(3000, '0.0.0.0');
}
bootstrap();
