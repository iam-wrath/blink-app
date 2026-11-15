# Blink: web

React + Vite viewer. One page, **Time-lapse**:

- Enter RA, Dec (degrees), field of view, detector (D1–D6) and mode (raw, or difference = each frame minus the first),
  or pick one of the five challenge targets from the presets list.
- Every SPHEREx frame of that patch plays like a little video, sorted by date: play/pause, prev/next,
  speed, and a date scrubber.
- The metadata panel shows date, wavelength, detector, data release and flags for the current frame.
- The search is mirrored in the URL (`?ra=&dec=&fov=&detector=&mode=`), so a link (or an iframe) reopens it.

## Run it

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

The API must be running (see the main README). Its address comes from `VITE_API_URL`
(copy `.env.example` to `.env`); the default is `http://localhost:3000/api`.

## Checks

```bash
npm run build
npm run lint
```
