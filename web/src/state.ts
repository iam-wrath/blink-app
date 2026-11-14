import type { Candidate, DetectResponse, Source, Status, Summary } from './types';
import type { SimTarget } from './lib/sim';
import type { RealDiff } from './lib/realDiff';

export type Page = 'compare' | 'explore' | 'disc' | 'saved' | 'about';
export type Mode = 'blink' | 'wipe' | 'side' | 'diff';

export interface SavedItem {
  id: string;
  ts: number;
  type: 'compare' | 'set' | 'pixel';
  src: string; // 'team' or a simulated target key
  custom?: SimTarget;
  name: string;
  A?: number;
  B?: number;
  n?: number;
  f?: number;
  x?: number;
  y?: number;
  lv?: number;
  note: string;
}

export interface St {
  page: Page;
  // what we look at: 'team' = the team's real data via the API, else a simulated target key
  src: string;
  custom: SimTarget | null;
  q: string;
  A: number;
  B: number;
  mode: Mode;
  epoch: 'A' | 'B';
  playing: boolean;
  interval: number;
  split: number;
  zoom: number;
  contrast: number;
  brightness: number;
  invert: boolean;
  rings: boolean;
  labels: boolean;
  hideKnown: boolean;
  th: number;
  ran: boolean;
  running: boolean;
  sel: number;
  simStatus: Record<string, Status>;
  hist: { label: string; src: string; custom: SimTarget | null; A: number; B: number }[];
  cur: { x: number; y: number } | null;
  toast: string;
  // sky explorer
  xc: number;
  layer: 'img' | 'prev' | 'first';
  stretch: 'asinh' | 'linear' | 'sqrt';
  coord: 'sky' | 'off';
  xz: number;
  grid: boolean;
  mask: boolean;
  xblink: boolean;
  bph: boolean;
  xplay: boolean;
  speed: number;
  loop: boolean;
  pix: { x: number; y: number } | null;
  xrep: boolean;
  // discoveries
  showArt: boolean;
  dsel: number;
  lc: Record<string, boolean>;
  rep: boolean;
  // saved
  saved: SavedItem[];
  of: 'all' | 'compare' | 'set' | 'pixel';
  oq: string;
  oldFirst: boolean;
  orep: boolean;
  arm: string | null;
}

export interface Team {
  data: DetectResponse | null;
  source: Source; // 'api' when Kwaku's API answers, 'fake' for the sample
  summary: Summary | null;
  urls: { a: string; b: string; diff: string | null };
  sorted: Candidate[];
  setStatus: (id: string, s: Status) => void;
  run: () => void;
  running: boolean;
  rd: { diff: RealDiff | null; url: string | null; loading: boolean };
}

export interface Ctx {
  S: St;
  set: (p: Partial<St>) => void;
  team: Team;
  say: (t: string) => void;
  save: (item: Omit<SavedItem, 'id' | 'ts' | 'note' | 'name' | 'src' | 'custom'>) => void;
  tgName: string;
}

const KEY = 'blink-saved-v1';
export function loadSaved(): SavedItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((o) => o && typeof o.id === 'string' && typeof o.type === 'string') : [];
  } catch {
    return [];
  }
}
export function storeSaved(items: SavedItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage blocked: keep for this session only */
  }
}

export const INITIAL: St = {
  page: 'compare',
  src: 'team',
  custom: null,
  q: '',
  A: 0,
  B: 7,
  mode: 'blink',
  epoch: 'A',
  playing: true,
  interval: 500,
  split: 50,
  zoom: 1,
  contrast: 100,
  brightness: 100,
  invert: true,
  rings: true,
  labels: true,
  hideKnown: false,
  th: 34,
  ran: false,
  running: false,
  sel: 0,
  simStatus: {},
  hist: [],
  cur: null,
  toast: '',
  xc: 0,
  layer: 'img',
  stretch: 'asinh',
  coord: 'sky',
  xz: 1,
  grid: true,
  mask: false,
  xblink: false,
  bph: false,
  xplay: false,
  speed: 1,
  loop: true,
  pix: null,
  xrep: false,
  showArt: false,
  dsel: 0,
  lc: {},
  rep: false,
  saved: [],
  of: 'all',
  oq: '',
  oldFirst: false,
  orep: false,
  arm: null,
};
