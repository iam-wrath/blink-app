# Blink: a SPHEREx time-lapse viewer

NASA Space Apps 2026 — challenge "Planet X and SPHEREx".

Enter sky coordinates (RA/Dec, degrees) or pick one of the challenge targets. Blink fetches every
SPHEREx image of that patch of sky from the IRSA archive, lines them up, sorts them by date and plays
them like a little video, so things that move or change brightness stand out.

- **Raw** mode: the frames themselves, on one shared brightness scale.
- **Difference** mode: each frame minus the first; grey = no change, white = brighter, black = fainter.
- Metadata for each frame: date, wavelength, detector, data release, quality flags.
- Shareable / embeddable: the search is in the URL, e.g.
  `http://localhost:5173/?ra=269.44636&dec=4.76705&fov=0.2&detector=D2&mode=raw`

Challenge targets (presets): WISE 0855 (D6), Barnard's Star, Epsilon Indi B, RW Aurigae, R Draconis (D2).
Positions are moved to the SPHEREx epoch using proper motion; sources in `docs/DATA.md`.

## Quick start (Windows)

```powershell
.\start.ps1            # detector :8000, api :3000, web :5173, opens the browser
.\start.ps1 -Prebake   # also caches the five challenge targets (raw + difference)
```

Needs Python 3.11+ (`py`), Node 20+ and internet for the first run.
If scripts are blocked: `powershell -ExecutionPolicy Bypass -File .\start.ps1`.

## Run each part by hand

**1. Frame service (`detector/`, Python, port 8000)**
```bash
cd detector
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn main:app --port 8000
```
`POST /frames {ra, dec, fovDeg, detector, mode}` → contract JSON. It queries IRSA live
(`irsa.py`), downloads the cutouts to `data/raw/`, aligns them to the earliest frame and writes PNGs
to `data/cache/frames/<search hash>/` (`build_frames.py`). If IRSA can't be reached it uses the
frames already saved in `data/raw/<target>/`. Set `BLINK_OFFLINE=1` to force that.

**2. API (`api/`, NestJS + Prisma/SQLite, port 3000)**
```bash
cd api
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
node dist/main.js
```
- `GET /api/targets`: the five challenge targets (`contract/targets.json`).
- `GET /api/frames?ra=&dec=&fov=&detector=&mode=`: frames for a patch of sky. Answers are cached in SQLite
  (`SearchCache`), so a search made once loads again with no internet and no frame service.
  To clear the cache (e.g. after a new SPHEREx data release), delete `api/prisma/dev.db` and run
  `npx prisma migrate deploy`.
- Serves the PNGs from `data/` at `/data/`.
- Settings (`api/.env`): `DATABASE_URL`, `DETECTOR_URL` (default `http://localhost:8000`),
  `DETECTOR_TIMEOUT_MS` (default 300000).

**3. Web (`web/`, React + Vite, port 5173)**
```bash
cd web
npm install
npm run dev
```
API address: `VITE_API_URL` in `web/.env` (default `http://localhost:3000/api`).

## Layout

```
contract/   API contract: example_frames.json, targets.json
detector/   frame service: main.py (FastAPI), irsa.py (IRSA search), build_frames.py (align + PNGs)
api/        NestJS API + SQLite cache
web/        React viewer
data/       downloaded FITS and generated PNGs (not in git)
docs/       data sources, archive query results, data notes
```

## Data and credit

Images: NASA **SPHEREx** mission (NASA / JPL-Caltech), retrieved from the
**NASA/IPAC Infrared Science Archive (IRSA)**, Caltech/IPAC, using its TAP and cutout services
(query adapted from IRSA's SPHEREx cutout tutorial). Built with Astropy, astroquery, reproject,
FastAPI, NestJS, Prisma and React.

Team: Albert (data, targets, IRSA search), Christabel (frame alignment and images),
Kwaku (API), Jude (web).
