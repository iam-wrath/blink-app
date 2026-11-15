import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { FramesService } from './frames.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: FramesService, useValue: {} }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('targets', () => {
    it('returns the five challenge targets with real coordinates', () => {
      const t = appController.targets();
      expect(t).toHaveLength(5);
      for (const x of t) {
        expect(typeof x.name).toBe('string');
        expect(x.ra).not.toBe(0);
        expect(x.dec).not.toBe(0);
        expect(x.fov).toBeGreaterThan(0);
      }
    });
  });
});
