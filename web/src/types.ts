// Shapes from the frames contract (GET /api/frames, GET /api/targets; see contract/).

export type FrameMode = 'raw' | 'diff';

export interface Target {
  name: string;
  ra: number;
  dec: number;
  fov: number;
  detector?: string; // band the target shows up best in (optional)
}

export interface FrameQuery {
  ra: number;
  dec: number;
  fov: number;
  detector: string;
  mode: FrameMode;
}

export interface Frame {
  id: string;
  obsTime: string;
  detector: string;
  wavelengthUm: number;
  release: string;
  flags: number;
  png: string; // relative to the API origin, e.g. data/cache/....png
}

export interface FramesResponse {
  query: { ra: number; dec: number; fovDeg: number; detector: string; mode: FrameMode };
  imageSize: { width: number; height: number };
  frames: Frame[];
}
