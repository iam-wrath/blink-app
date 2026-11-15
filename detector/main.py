"""Blink frame service: POST /frames -> contract JSON (see contract/example_frames.json).

1. irsa.find_cutouts (Albert): every SPHEREx cutout covering (ra, dec) for one detector, live from
   IRSA, downloaded to data/raw/. Falls back to data/raw/<target>/ when IRSA can't be reached.
2. build_frames.load + render (Christabel): align every frame to the earliest one, one shared
   brightness scale, difference = each frame minus the first; PNGs flipped to top-left origin.
3. PNGs go to data/cache/frames/<key>/, where key = hash of (ra, dec, fov, detector, mode),
   so different searches never overwrite each other. The API serves data/ at /data/.

Run from the detector folder:  uvicorn main:app --port 8000
"""
import hashlib
import os
import sys
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)  # irsa.py and build_frames.py live next to this file
os.chdir(ROOT)  # irsa.py uses paths relative to the project root (data/raw, contract/targets.json)

import irsa  # noqa: E402
from build_frames import SOURCE_BIT, load, render  # noqa: E402

CACHE_DIR = os.path.join("data", "cache", "frames")

app = FastAPI(title="Blink frame service")


class FramesRequest(BaseModel):
    ra: float
    dec: float
    fovDeg: float = 0.1
    detector: str = "D2"
    mode: Literal["raw", "diff"] = "raw"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/frames")
def frames(req: FramesRequest):
    try:
        _, det = irsa._bandpass(req.detector)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not (0 <= req.ra <= 360 and -90 <= req.dec <= 90 and 0 < req.fovDeg <= 2):
        raise HTTPException(400, "ra must be 0..360, dec -90..90, fovDeg above 0 and at most 2")

    query = {"ra": req.ra, "dec": req.dec, "fovDeg": req.fovDeg, "detector": det, "mode": req.mode}
    # same as irsa.find_cutouts, but tells "IRSA is down" apart from "IRSA has no images here"
    rows = None
    if os.environ.get("BLINK_OFFLINE") != "1":
        try:
            rows = irsa._find_cutouts_online(req.ra, req.dec, req.fovDeg, det)
        except Exception as e:
            print(f"  IRSA not reachable ({type(e).__name__}: {str(e)[:120]}); trying frames saved in data/raw/")
    if rows is None:
        rows = irsa.find_local(req.ra, req.dec, req.fovDeg, det)
        if not rows:
            raise HTTPException(503, "The SPHEREx archive (IRSA) can't be reached right now, and there are no saved frames "
                                     "for this position. Try again later, or pick one of the preset targets.")

    # read each FITS; skip unreadable ones
    good = []
    for r in rows:
        try:
            good.append((r, load(r["path"])))
        except Exception as e:
            print(f"  skip unreadable {r.get('path')}: {e}")
    good.sort(key=lambda x: x[0]["obsTime"])
    if not good:
        return {"query": query, "imageSize": {"width": 0, "height": 0}, "frames": []}

    key = hashlib.sha1(f"{req.ra:.4f}|{req.dec:.4f}|{req.fovDeg}|{det}|{req.mode}".encode()).hexdigest()[:10]
    outdir = os.path.join(CACHE_DIR, key)
    paths = render([f for _, f in good], outdir, prefix=f"{key}_")
    h, w = good[0][1]["data"].shape

    out = []
    for i, ((row, f), (raw_p, diff_p)) in enumerate(zip(good, paths), start=1):
        png = raw_p if req.mode == "raw" else diff_p
        wl = row.get("wavelengthUm") or f["wave"]
        out.append({
            "id": f"{key}-{i:03d}",
            "obsTime": row["obsTime"],
            "detector": det,
            "wavelengthUm": round(float(wl), 3),
            "release": row.get("release") or "",
            # FLAGS bits at the target pixel; bit 21 (source present) is set almost everywhere and is not a problem
            "flags": int(row.get("flags") or 0) & ~SOURCE_BIT,
            "png": png.replace(os.sep, "/"),
        })
    return {"query": query, "imageSize": {"width": int(w), "height": int(h)}, "frames": out}
