import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

@Controller()
export class AppController {
  @Get('candidates')
  candidates() {
    return JSON.parse(
      readFileSync(join(process.cwd(), '..', 'contract', 'example_response.json'), 'utf8'),
    );
  }
}