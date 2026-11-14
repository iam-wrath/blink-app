# Blink: web (Jude)

The website the judges see, in the SPHEREx Explorer style (dark mission-control look).
Covers guide steps J1–J8, plus zoom and pan from the workplan.

**Viewer modes:** Blink (manual flip or auto-blink at 0.5–5 Hz) · Split slider (wipe) ·
Side by side (synced zoom) · Difference map (B − A, built in the browser).
**Tools:** wheel / double-click zoom, drag to pan, cursor pixel + approximate RA/Dec,
candidate cutouts with a mini blink, confidence histogram filter, queue filters,
search by id or RA, Dec, sortable table with CSV export, keyboard shortcuts (press `?`).

## Run it

```bash
cd blink/web
npm install          # once (needs internet; after that it works offline)
npm run dev          # open http://localhost:5173
```

If Kwaku's API isn't running, the app shows **sample data** with a yellow notice,
so you are never blocked.

To test the whole thing without Kwaku, run the mock API in a second terminal:

```bash
npm run mock         # fake API on http://localhost:3000/api
```

## Settings

Copy `.env.example` to `.env`, edit it, and restart `npm run dev`.

| Setting | What it does |
|---|---|
| `VITE_API_URL` | Where Kwaku's API is. Default `http://localhost:3000/api`. On another laptop use his IP. |
| `VITE_USE_FAKE` | `true` = always use sample data, never call the API. |
| `VITE_IMAGE_A` / `VITE_IMAGE_B` | Only if the two pictures are served at other URLs. |

## What the app calls (tell Kwaku)

| Call | Expects |
|---|---|
| `GET /api/candidates` | The contract response, **plus `"status"` on every candidate** (`pending`, `confirmed`, `rejected`). Must include `imageSize`. |
| `GET /api/images/a.png`, `/api/images/b.png` | The two PNGs Christabel saves (`a.png`, `b_aligned.png`). Fixed URLs. |
| `PATCH /api/candidates/:id` | Body `{ "status": "confirmed" }`. |
| `GET /api/summary` | `{ total, matchedKnown, unmatched, confirmed, rejected }`. |
| `POST /api/detect` | Runs detection, returns the contract response. |

`mock-api.mjs` is a working example of all five. The app also accepts the
database shape (`knownName` / `knownSepArc`) in case the API returns that.

## Keys

`Space` flip · `P` auto-blink · `1–4` modes · `J/K` next/prev · `C` confirm · `R` reject ·
`U` undo · `F` zoom to selected · `+/−/0` zoom · `M/L` rings/labels · `?` all shortcuts

## Difference map with the real API

The browser builds the difference from the two PNGs. For that, Kwaku's image
responses need `Access-Control-Allow-Origin: *`. If he can't add it, he can serve
Christabel's `diff.png` at `/api/images/diff.png` and the app uses that instead.

## Where things are

- `src/App.tsx`: loads data, fallback to sample data, keyboard shortcuts
- `src/api.ts`: every API call and the settings
- `src/components/`: `Viewer` (modes, toolbar, zoom bar), `Stage` (one picture with rings, wipe, zoom/pan),
  `Inspector` (candidate card, detection run, queue), `Chrome` (sidebar, top bar, shortcuts), `Pages` (table, how it works)
- `src/lib/`: zoom maths, difference map, approximate sky coordinates, status helpers
- `src/styles.css`: the dark theme (colours at the top, from DESIGN.md)
- `public/fake/`: two sample sky pictures where c-001 and c-002 really move

## If something looks wrong

- **Dots upside down:** it's the FITS flip. Tell Christabel. Don't fix it here.
- **Dots in the wrong place but not flipped:** check `imageSize` matches the PNG's real size.
- **"Can't reach the API":** is Kwaku's API running, and is `VITE_API_URL` right? Is CORS on (`app.enableCors()`)?
