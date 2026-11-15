"""
measure_motion.py  -  A6: measure how far a target moved across its SPHEREx frames (no internet)

For each frame in data/raw/<target>/ it finds the target near where it should be,
measures its centre (brightness-weighted), converts that to RA/Dec with the frame's own
sky coordinates, then fits a straight line through time -> measured motion per year.

Run from the project root:
    python measure_motion.py                    # WISE 0855 and Barnard's Star
    python measure_motion.py "Epsilon Indi B"   # any target in contract/targets.json
"""
import glob
import json
import logging
import os
import re
import sys
import warnings

import numpy as np
from astropy import log as astropy_log
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
import astropy.units as u

warnings.filterwarnings("ignore")
astropy_log.setLevel("WARNING")
logging.getLogger("astropy").setLevel(logging.WARNING)

EPOCH = 2025.6        # targets.json positions are for this year
PIX = 6.15            # SPHEREx pixel size, arcsec
# Catalogue proper motions (mas/yr) used only to know where to look in each frame
PM = {
    "WISE 0855": (-8123.7, 673.2),
    "Barnard's Star": (-801.551, 10362.394),
    "Epsilon Indi B": (3966.661, -2536.192),
    "RW Aurigae": (2.641, -27.398),
    "R Draconis": (0.0, 0.0),
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def expected(t, year):
    pmra, pmdec = PM.get(t["name"], (0.0, 0.0))
    dt = year - EPOCH
    dec = t["dec"] + pmdec * dt / 3.6e6
    ra = t["ra"] + pmra * dt / 3.6e6 / np.cos(np.radians(t["dec"]))
    return SkyCoord(ra * u.deg, dec * u.deg)


def measure(path, t, search_px=3, box=2):
    with fits.open(path) as h:
        img = h["IMAGE"].data.astype(float)
        hdr = h["IMAGE"].header
        flags = h["FLAGS"].data if "FLAGS" in h else None
    w = WCS(hdr)
    tm = Time(hdr.get("MJD-AVG", hdr.get("MJD-OBS")), format="mjd")
    guess = expected(t, tm.decimalyear)
    gx, gy = (float(v) for v in w.world_to_pixel(guess))
    ny, nx = img.shape
    bg = np.nanmedian(img)
    data = np.nan_to_num(img - bg)
    # brightest pixel within search_px of the guess
    x0, x1 = max(int(gx) - search_px, 0), min(int(gx) + search_px + 1, nx)
    y0, y1 = max(int(gy) - search_px, 0), min(int(gy) + search_px + 1, ny)
    if x1 <= x0 or y1 <= y0:
        return None
    sub = data[y0:y1, x0:x1]
    py, px = np.unravel_index(np.argmax(sub), sub.shape)
    px, py = px + x0, py + y0
    # brightness-weighted centre in a small box around it
    bx0, bx1 = max(px - box, 0), min(px + box + 1, nx)
    by0, by1 = max(py - box, 0), min(py + box + 1, ny)
    patch = np.clip(data[by0:by1, bx0:bx1], 0, None)
    if patch.sum() <= 0:
        return None
    yy, xx = np.mgrid[by0:by1, bx0:bx1]
    cx, cy = float((xx * patch).sum() / patch.sum()), float((yy * patch).sum() / patch.sum())
    noise = 1.4826 * np.nanmedian(np.abs(data - np.nanmedian(data)))
    snr = float(data[py, px] / (noise + 1e-12))
    pos = w.pixel_to_world(cx, cy)
    flag = int(flags[py, px]) if flags is not None else 0
    return {"year": tm.decimalyear, "date": tm.iso[:10], "ra": pos.ra.deg, "dec": pos.dec.deg,
            "snr": snr, "flag": flag, "peak": float(data[py, px])}


def main():
    names = sys.argv[1:] or ["WISE 0855", "Barnard's Star"]
    targets = {t["name"]: t for t in json.load(open(os.path.join("contract", "targets.json")))}
    lines = []
    for name in names:
        t = targets.get(name)
        if not t:
            print(f"{name}: not in contract/targets.json")
            continue
        files = sorted(glob.glob(os.path.join("data", "raw", slug(name), "*.fits")))
        rows = [r for r in (measure(f, t) for f in files) if r]
        good = [r for r in rows if r["snr"] >= 5]
        print(f"\n=== {name}: {len(files)} frames, {len(good)} with a clear detection (SNR >= 5)")
        for r in sorted(rows, key=lambda r: r["year"]):
            print(f"  {r['date']}  RA {r['ra']:.6f}  Dec {r['dec']:+.6f}  SNR {r['snr']:5.1f}"
                  + ("" if r["snr"] >= 5 else "  (too faint, ignored)"))
        if len(good) < 2 or max(r["year"] for r in good) - min(r["year"] for r in good) < 0.3:
            print("  Not enough well-separated detections to measure motion.")
            lines.append(f"- {name}: motion not measurable (only {len(good)} clear detections)")
            continue
        # drop single-frame glitches (e.g. a cosmic ray): absurd SNR for a faint target, or far off the trend
        med_snr = np.median([r["snr"] for r in good])
        good = [r for r in good if r["snr"] < 50 * med_snr]
        for _ in range(2):
            yr_ = np.array([r["year"] for r in good])
            cd = np.cos(np.radians(np.mean([r["dec"] for r in good])))
            xs = np.array([r["ra"] for r in good]) * cd * 3.6e6
            ys = np.array([r["dec"] for r in good]) * 3.6e6
            res = np.hypot(xs - np.polyval(np.polyfit(yr_, xs, 1), yr_), ys - np.polyval(np.polyfit(yr_, ys, 1), yr_))
            lim = max(3 * 1.4826 * np.median(res), PIX * 1000 * 0.5)
            keep = [r for r, e in zip(good, res) if e <= lim]
            if len(keep) == len(good) or len(keep) < 3:
                break
            print(f"  dropped {len(good) - len(keep)} outlier frame(s)")
            good = keep
        yr = np.array([r["year"] for r in good])
        ra = np.array([r["ra"] for r in good])
        dec = np.array([r["dec"] for r in good])
        cosd = np.cos(np.radians(dec.mean()))
        x = (ra - ra.mean()) * cosd * 3.6e6     # mas, east
        y = (dec - dec.mean()) * 3.6e6          # mas, north
        (pmx, _), cov_x = np.polyfit(yr, x, 1, cov=len(good) > 3)
        (pmy, _), cov_y = np.polyfit(yr, y, 1, cov=len(good) > 3)
        ex = float(np.sqrt(cov_x[0][0])) if len(good) > 3 else float("nan")
        ey = float(np.sqrt(cov_y[0][0])) if len(good) > 3 else float("nan")
        span = yr.max() - yr.min()
        total = np.hypot(pmx, pmy) * span / 1000  # arcsec moved over the span
        cat = PM.get(name, (0, 0))
        ang = (np.degrees(np.arctan2(pmx, pmy)) + 360) % 360   # 0 = north, 90 = east
        direction = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][int((ang + 22.5) // 45) % 8]
        print(f"  Measured motion: RA {pmx:+.0f} ± {ex:.0f} mas/yr, Dec {pmy:+.0f} ± {ey:.0f} mas/yr")
        print(f"  Catalogue:       RA {cat[0]:+.0f} mas/yr,       Dec {cat[1]:+.0f} mas/yr")
        print(f"  Over {span:.2f} yr it moved {total:.1f}\" = {total / PIX:.1f} SPHEREx pixels, towards the {direction}")
        lines.append(f"- {name}: moved {total:.1f}\" ({total / PIX:.1f} px) towards the {direction} between "
                     f"{min(good, key=lambda r: r['year'])['date']} and {max(good, key=lambda r: r['year'])['date']} "
                     f"({len(good)} frames). Measured {pmx:+.0f}/{pmy:+.0f} mas/yr vs catalogue "
                     f"{cat[0]:+.0f}/{cat[1]:+.0f} mas/yr.")
    print("\nPaste into docs/targets.md under 'Measured motion (A6)':")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
    