# Blink: a SPHEREx time-lapse viewer

NASA Space Apps 2026 — challenge "Planet X and SPHEREx".

Enter sky coordinates (RA/Dec, degrees) or pick one of the challenge targets. Blink fetches every
SPHEREx image of that patch of sky from the IRSA archive, lines them up, sorts them by date and plays
them like a little video, so things that move or change brightness stand out.

- **Raw** mode: the frames themselves, on one shared brightness scale.
- **Difference** mode: each frame minus the first; grey = no change, white = brighter, black = fainter.
- A red cross-hair marks the searched position (the target), with an open centre so the target stays
  visible; a fast mover like Barnard's Star drifts within it over the year. Toggle with "Mark target".
- Images: background subtracted, asinh brightness stretch, flagged pixels filled (saturated star cores
  stay bright), smoothly enlarged to ~470 px. SPHEREx pixels are ~6″, so a 0.1° cutout is only ~60 pixels.
- **Co-add each visit** (`coadd=visit` in the URL): SPHEREx images a patch several times within a few
  hours, then returns weeks later. Co-adding averages the aligned frames of each visit into one, cutting
  the noise by about √n so faint targets show up (WISE 0855 at D6: signal-to-noise at the target goes from
  ~2–8 per frame to up to ~11 per visit). Motion within a visit is negligible, so movers stay sharp.
  On by default for the WISE 0855 preset.
- Metadata for each frame: date, wavelength, detector, data release, quality flags (and frames co-added).
- Shareable / embeddable: the search is in the URL, e.g.
  `http://localhost:5173/?ra=269.44636&dec=4.76705&fov=0.2&detector=D2&mode=raw`

Challenge targets (presets): WISE 0855 (D6), Barnard's Star, Epsilon Indi B, RW Aurigae, R Draconis (D2).
Positions are moved to the SPHEREx epoch using proper motion; sources in `docs/DATA.md`.

The site opens on a landing page (a three.js sky sphere, a live Barnard's Star loop and the five targets);
the viewer is at `/#/explore`, and any link with `?ra=&dec=` opens the viewer directly.

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
- Security settings:
  - `HOST`: default `127.0.0.1` (this machine only). Set `HOST=0.0.0.0` to let other laptops reach the API.
  - `CORS_ORIGIN`: comma-separated sites allowed to call the API from a browser; default `*` (read-only, GET only).
  - `RATE_LIMIT`: requests per minute per client on `/api`, default 120.
  - `MAX_CONCURRENT_SEARCHES`: new (uncached) searches running at once, default 2; extra ones get a "busy, try again" message.
  - Only the generated PNGs (`data/cache/`) are served; downloaded FITS files are not.

**3. Web (`web/`, React + Vite, port 5173)**
```bash
cd web
npm install
npm run dev
```
API address: `VITE_API_URL` in `web/.env` (default `http://localhost:3000/api`).

## Hosting: Vercel (site) + Render (API and frame service)

The site is static, so it goes on Vercel. The frame service (Astropy, SciPy, minutes-long IRSA downloads)
and the API (SQLite cache) run as Docker containers on Render. Vercel forwards `/api` and `/data/cache` to
Render, so visitors only ever see your Vercel domain.

The five challenge targets work on a fresh deploy, even with IRSA down: `seed/` holds their cached
searches and PNGs (about 5 MB), which the API loads every time it starts.

**1. Render: both back-end services, from `render.yaml`.** Push this branch to GitHub. In the Render
dashboard: New → Blueprint → connect the repo (and pick the branch) → Apply. It creates:
- `blink-detector`, the frame service, with a generated `DETECTOR_TOKEN` secret.
- `blink-api`, the API, which gets the same secret and calls the frame service at
  `https://blink-detector.onrender.com`. If Render named the frame service differently, set the API's
  `DETECTOR_URL` to its address (Environment tab).
- Check: `https://blink-api.onrender.com/api/targets` lists the five targets (use your API's real address).

**2. Vercel: the site.** In `web/vercel.json`, replace both `YOUR-BLINK-API.onrender.com` with your API's
address (e.g. `blink-api.onrender.com`), commit and push. Then on Vercel: Add New → Project → import this repo →
**Root Directory: `web`** → Deploy. Vercel adds HTTPS, and you can attach your own domain under Settings → Domains.

Notes on Render's free plan (no card needed):
- Services sleep after 15 minutes without visitors and take about a minute to wake, so the first visit
  after a quiet spell may show an error or a timeout for a few seconds. A paid instance (Starter, $7/month
  each) stays awake; to keep searches across restarts, also add a disk mounted at `/app/state` for the API.
- There is no disk on the free plan: searches other than the five built-in targets are kept only until the
  service restarts.
- The frame service has a public address here, so only requests carrying `DETECTOR_TOKEN` can start a search.
- Vercel cuts off a forwarded request after about two minutes, so a brand-new search that takes longer shows a
  timeout; the frame service keeps working and the next try is served from the cache.
- Optional API variables: `RATE_LIMIT` (default 120 per minute per visitor), `MAX_CONCURRENT_SEARCHES` (default 2),
  `DETECTOR_TIMEOUT_MS`, `CORS_ORIGIN`.
- After changing how images are made, refresh the seed with the API running locally: `py scripts/export_seed.py`.

## Hosting: Docker Compose (any server)

All three parts behind nginx on one port, on any Linux server or VPS:

```bash
git clone https://github.com/iam-wrath/blink-app.git && cd blink-app
docker compose up -d --build
```

- The site is on port 8080 (`BLINK_PORT=80 docker compose up -d` to change it). Only nginx is published; the API and frame service stay inside Compose's network.
- Put HTTPS in front (Caddy, Traefik, certbot or your host's load balancer).
- Data lives in two volumes: `blink-data` (downloads and PNGs) and `blink-state` (the SQLite cache). `docker compose down -v` deletes both.
- Settings (in a `.env` next to `docker-compose.yml`): `BLINK_PORT`, `RATE_LIMIT`, `MAX_CONCURRENT_SEARCHES`, `DETECTOR_TIMEOUT_MS`.
- Updating: `git pull && docker compose up -d --build`.

## Layout

```
contract/   API contract: example_frames.json, targets.json
detector/   frame service: main.py (FastAPI), irsa.py (IRSA search), build_frames.py (align + PNGs)
api/        NestJS API + SQLite cache
web/        React viewer
seed/       the five targets' cached searches and PNGs, loaded by the API on start
deploy/     nginx config for the Docker setup (render.yaml is at the root)
scripts/    export_seed.py (refreshes seed/)
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
