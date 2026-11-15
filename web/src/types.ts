// Shapes from the frames contract (GET /api/frames, GET /api/targets; see contract/).

export type FrameMode = 'raw' | 'diff';

export interface Target {
  name: string;
  ra: number;
  dec: number;
  fov: number;
  detector?: string; // band the target shows up best in (optional)
  coadd?: CoaddMode; // co-add each visit by default for this target (optional; faint targets)
}

export type CoaddMode = 'none' | 'visit';

export interface FrameQuery {
  ra: number;
  dec: number;
  fov: number;
  detector: string;
  mode: FrameMode;
  coadd: CoaddMode;
}

export interface Frame {
  id: string;
  obsTime: string;
  detector: string;
  wavelengthUm: number;
  release: string;
  flags: number;
  png: string; // relative to the API origin, e.g. data/cache/....png
  nFrames?: number; // only when co-adding: how many frames were added into this one
}

export interface FramesResponse {
  query: { ra: number; dec: number; fovDeg: number; detector: string; mode: FrameMode; coadd?: CoaddMode };
  imageSize: { width: number; height: number };
  target?: { x: number; y: number }; // searched position in PNG pixels (origin top-left)
  frames: Frame[];
}
