"""
download_targets.py  -  get the SPHEREx pictures for the five targets and make quick previews

For each target in contract/targets.json:
  1. find_cutouts() (detector/irsa.py) downloads its SPHEREx cutouts to data/raw/
  2. every frame is aligned to the first one (same stars, same pixels)
  3. one shared brightness scale for all frames (no flicker)
  4. saves  data/preview/<target>.gif          (time-lapse, for checking and for slides)
            data/preview/<target>_first.png    (earliest frame)
            data/preview/<target>_last.png     (latest frame)
     with a small cross at the target position.

Run from the project root (after make_targets.py has made contract/targets.json):
    python download_targets.py                          # all 5 targets, D2, up to 20 frames each
    python download_targets.py --detector D3 --limit 40
    python download_targets.py --target "WISE 0855"     # just one
Each frame is at least ~4 MB, so 5 targets x 20 frames is roughly 400 MB.
"""
import argparse
import json
import os
import re
import sys
import warnings

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
import astropy.units as u
from PIL import Image, ImageDraw
from reproject import reproject_interp

sys.path.insert(0, "detector")
from irsa import find_cutouts  # noqa: E402

warnings.filterwarnings("ignore")
OUT = os.path.join("data", "preview")


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def load(path):
    with fits.open(path) as h:
        return h["IMAGE"].data.astype(float), WCS(h["IMAGE"].header)


def to_img(arr, lo, hi, cross=None, label=None, scale=4):
    img = np.nan_to_num(np.clip((arr - lo) / (hi - lo + 1e-12), 0, 1))
    im = Image.fromarray((np.flipud(img) * 255).astype("uint8")).convert("RGB")
    im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    d = ImageDraw.Draw(im)
    if cross is not None:
        x, y = cross[0] * scale, (arr.shape[0] - 1 - cross[1]) * scale  # flip y for the picture
        for a, b in [((x - 14, y), (x - 5, y)), ((x + 5, y), (x + 14, y)),
                     ((x, y - 14), (x, y - 5)), ((x, y + 5), (x, y + 14))]:
            d.line([a, b], fill=(255, 80, 80), width=2)
    if label:
        d.rectangle([0, 0, im.width, 16], fill=(0, 0, 0))
        d.text((4, 2), label, fill=(255, 255, 255))
    return im


def do_target(t, detector, limit):
    name = t["name"]
    print(f"\n=== {name}: RA {t['ra']}, Dec {t['dec']}, FOV {t['fov']} deg, {detector}")
    frames = find_cutouts(t["ra"], t["dec"], t["fov"], detector, download=True, limit=limit)
    if not frames:
        print("  no frames downloaded")
        return None
    print(f"  {len(frames)} frames, {frames[0]['obsTime'][:10]} to {frames[-1]['obsTime'][:10]}")

    ref_arr, ref_wcs = load(frames[0]["path"])
    arrays = [ref_arr]
    for f in frames[1:]:
        arr, w = load(f["path"])
        aligned, _ = reproject_interp((arr, w), ref_wcs, shape_out=ref_arr.shape)
        arrays.append(aligned)

    vals = np.concatenate([a[np.isfinite(a)].ravel() for a in arrays])
    vals = vals[np.abs(vals) < 1e10]  # ignore any absurd values
    lo, hi = np.percentile(vals, [1, 99.5])
    cx, cy = ref_wcs.world_to_pixel(SkyCoord(t["ra"] * u.deg, t["dec"] * u.deg))
    cross = (float(cx), float(cy))

    os.makedirs(OUT, exist_ok=True)
    s = slug(name)
    imgs = [to_img(a, lo, hi, cross, f"{name}  {f['obsTime'][:16]}  {f['wavelengthUm']:.2f} um")
            for a, f in zip(arrays, frames)]
    imgs[0].save(os.path.join(OUT, f"{s}_first.png"))
    imgs[-1].save(os.path.join(OUT, f"{s}_last.png"))
    imgs[0].save(os.path.join(OUT, f"{s}.gif"), save_all=True, append_images=imgs[1:], duration=400, loop=0)
    print(f"  saved {OUT}/{s}.gif, {s}_first.png, {s}_last.png")
    return {"name": name, "frames": len(frames), "from": frames[0]["obsTime"], "to": frames[-1]["obsTime"],
            "wavelengths": f"{min(f['wavelengthUm'] for f in frames):.2f}-{max(f['wavelengthUm'] for f in frames):.2f} um"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detector", default="D2")
    ap.add_argument("--limit", type=int, default=20, help="max frames per target (0 = all)")
    ap.add_argument("--target", default=None, help="only this target name")
    a = ap.parse_args()

    targets = json.load(open(os.path.join("contract", "targets.json")))
    if a.target:
        targets = [t for t in targets if t["name"].lower() == a.target.lower()]
        if not targets:
            raise SystemExit(f"No target called {a.target!r} in contract/targets.json")

    summary = []
    for t in targets:
        try:
            r = do_target(t, a.detector, a.limit or None)
            if r:
                summary.append(r)
        except Exception as e:  # one bad target must not stop the others
            print(f"  FAILED: {e}")
    print("\nSummary:")
    for r in summary:
        print(f"  {r['name']:15s} {r['frames']:3d} frames  {r['from'][:10]} to {r['to'][:10]}  {r['wavelengths']}")


if __name__ == "__main__":
    main()
