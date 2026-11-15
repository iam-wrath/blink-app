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
import secrets
import sys
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)  # irsa.py and build_frames.py live next to this file
os.chdir(ROOT)  # irsa.py uses paths relative to the project root (data/raw, contract/targets.json)

import irsa  # noqa: E402
from build_frames import SOURCE_BIT, load, render, upscale_for, visits  # noqa: E402

CACHE_DIR = os.path.join("data", "cache", "frames")
os.makedirs(CACHE_DIR, exist_ok=True)
DETECTOR_TOKEN = os.environ.get("DETECTOR_TOKEN", "")

# no interactive docs on a service that may be public
app = FastAPI(title="Blink frame service", docs_url=None, redoc_url=None, openapi_url=None)
# The generated PNGs, for the API to pass on when it doesn't share this service's disk
# (e.g. on Render). Only data/cache/frames is exposed, never data/raw.
app.mount("/data/cache/frames", StaticFiles(directory=CACHE_DIR), name="frames")


class FramesRequest(BaseModel):
    ra: float
    dec: float
    fovDeg: float = 0.1
    detector: str = "D2"
    mode: Literal["raw", "diff"] = "raw"
    # "visit": co-add the frames of each visit (taken within ~2 days) into one, for faint targets
    coadd: Literal["none", "visit"] = "none"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/frames")
def frames(req: FramesRequest, x_blink_token: str | None = Header(default=None)):
    # When this service has a public address (Render's free plan), only the API may start searches:
    # both get the same DETECTOR_TOKEN, and the API sends it as X-Blink-Token.
    if DETECTOR_TOKEN and not secrets.compare_digest((x_blink_token or "").encode(), DETECTOR_TOKEN.encode()):
        raise HTTPException(401, "missing or wrong X-Blink-Token")
    try:
        _, det = irsa._bandpass(req.detector)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not (0 <= req.ra <= 360 and -90 <= req.dec <= 90 and 0 < req.fovDeg <= 2):
        raise HTTPException(400, "ra must be 0..360, dec -90..90, fovDeg above 0 and at most 2")

    query = {"ra": req.ra, "dec": req.dec, "fovDeg": req.fovDeg, "detector": det, "mode": req.mode, "coadd": req.coadd}
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

    key_src = f"{req.ra:.4f}|{req.dec:.4f}|{req.fovDeg}|{det}|{req.mode}" + ("" if req.coadd == "none" else f"|{req.coadd}")
    key = hashlib.sha1(key_src.encode()).hexdigest()[:10]
    outdir = os.path.join(CACHE_DIR, key)
    ref = good[0][1]
    # one output frame per input frame, or per visit when co-adding
    groups = visits([r["obsTime"] for r, _ in good]) if req.coadd == "visit" else [[i] for i in range(len(good))]
    paths = render([f for _, f in good], outdir, prefix=f"{key}_", groups=groups if req.coadd == "visit" else None)
    s = upscale_for(ref["data"].shape)   # PNGs are enlarged s times
    ny, nx = ref["data"].shape
    w, h = nx * s, ny * s
    # where the searched position falls in the PNGs (every frame is aligned to the first one).
    # FITS pixel (x, y), origin bottom-left -> PNG pixel, origin top-left, enlarged s times.
    tx, ty = ref["wcs"].world_to_pixel_values(req.ra, req.dec)
    target = {"x": round((float(tx) + 0.5) * s, 1), "y": round((ny - 0.5 - float(ty)) * s, 1)}

    out = []
    for i, (g, (raw_p, diff_p)) in enumerate(zip(groups, paths), start=1):
        members = [good[k] for k in g]
        png = raw_p if req.mode == "raw" else diff_p
        wls = [float(row.get("wavelengthUm") or f["wave"]) for row, f in members]
        flags = 0
        for row, _ in members:
            # FLAGS bits at the target pixel; bit 21 (source present) is set almost everywhere and is not a problem
            flags |= int(row.get("flags") or 0) & ~SOURCE_BIT
        frame = {
            "id": f"{key}-{i:03d}",
            "obsTime": mean_time([row["obsTime"] for row, _ in members]),
            "detector": det,
            "wavelengthUm": round(sum(wls) / len(wls), 3),   # mean when co-added
            "release": ", ".join(sorted({row.get("release") or "" for row, _ in members} - {""})),
            "flags": flags,   # any flag set in any co-added frame
            "png": png.replace(os.sep, "/"),
        }
        if req.coadd != "none":
            frame["nFrames"] = len(members)   # how many frames were co-added into this one
        out.append(frame)
    return {"query": query, "imageSize": {"width": int(w), "height": int(h)}, "target": target, "frames": out}


def mean_time(iso_times):
    """Mean of ISO times ('...Z'), as an ISO time with Z (the time itself when there is only one)."""
    if len(iso_times) == 1:
        return iso_times[0]
    from astropy.time import Time
    t = Time([s.rstrip("Z") for s in iso_times], format="isot", scale="utc")
    return Time(t.mjd.mean(), format="mjd", scale="utc").isot[:19] + "Z"
