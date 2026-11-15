"""Turn each target folder into aligned PNGs (raw and diff) plus frames.json.
Run from the detector folder:
  python build_frames.py ../data/raw ../data/cache
"""
import sys, glob, os, json, warnings
import numpy as np
warnings.filterwarnings("ignore")
from astropy.io import fits
from astropy.wcs import WCS
from astropy import log
log.setLevel("WARNING")
from reproject import reproject_interp
from scipy import ndimage
from PIL import Image

SOURCE_BIT = 1 << 21   # set on ~99% of pixels in these crowded fields: do NOT treat as bad



def load(path):
    with fits.open(path) as h:
        hd = h["IMAGE"].header
        d = h["IMAGE"].data.astype(float)
        bad = (h["FLAGS"].data & ~SOURCE_BIT) != 0
        w = WCS(hd, fobj=h)
        ny, nx = d.shape
        wl = float(WCS(hd, fobj=h, key="W").pixel_to_world_values(nx // 2, ny // 2)[0])
        d[bad] = np.nan
        return {"data": d, "wcs": w, "date": hd["DATE-OBS"], "det": f"D{hd.get('DETECTOR')}",
                "wave": wl, "release": hd.get("VERSION", ""), "name": os.path.basename(path),
                "flagfrac": float(bad.mean())}


def save_png(arr, path, lo, hi, fill=0.0):
    """fill = grey level (0..1) for masked/missing pixels: black for raw, mid-grey for diff."""
    img = np.clip((arr - lo) / (hi - lo + 1e-9), 0, 1)
    img = np.where(np.isfinite(arr), img, fill)
    Image.fromarray((np.flipud(img) * 255).astype("uint8")).save(path)   # flip once, here only


def render(fr, outdir, prefix=""):
    """Align frames (already loaded with load() and sorted by date) to the first one and save
    <prefix>raw_NNN.png and <prefix>diff_NNN.png in outdir. Returns the (raw, diff) path pairs, in order.
    Used by build_frames.py (below) and by the frame service (main.py)."""
    os.makedirs(outdir, exist_ok=True)
    ref = fr[0]
    # align every frame to the first (earliest) one
    aligned = [ref["data"]]
    for f in fr[1:]:
        a, _ = reproject_interp((f["data"], f["wcs"]), ref["wcs"], shape_out=ref["data"].shape)
        aligned.append(a)
    # remove each frame's own background level, so brightness steps don't flicker
    aligned = [a - np.nanmedian(a) for a in aligned]
    # ONE shared brightness scale for all raw frames
    vals = np.concatenate([a[np.isfinite(a)] for a in aligned])
    lo, hi = np.percentile(vals, [1, 99.5])
    # difference frames: each minus the first, symmetric scale
    diffs = []
    for a in aligned:
        d = a - aligned[0]
        # remove the slow background gradient (sky background differs between dates)
        d = d - ndimage.median_filter(np.nan_to_num(d), size=31)
        diffs.append(np.where(np.isfinite(a) & np.isfinite(aligned[0]), d, np.nan))
    dv = np.concatenate([d[np.isfinite(d)] for d in diffs[1:]]) if len(diffs) > 1 else np.array([])
    lim = np.percentile(np.abs(dv), 99) if dv.size else 1.0
    paths = []
    for i, (a, d) in enumerate(zip(aligned, diffs), start=1):
        raw_p = os.path.join(outdir, f"{prefix}raw_{i:03d}.png")
        diff_p = os.path.join(outdir, f"{prefix}diff_{i:03d}.png")
        save_png(a, raw_p, lo, hi)
        save_png(d, diff_p, -lim, lim, fill=0.5)
        paths.append((raw_p, diff_p))
    return paths


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "../data/raw"
    out_root = sys.argv[2] if len(sys.argv) > 2 else "../data/cache"
    folders = sorted({os.path.dirname(p) for p in glob.glob(os.path.join(root, "**", "*.fits"), recursive=True)})
    for folder in folders:
        target = os.path.basename(folder)
        frames = [load(f) for f in sorted(glob.glob(os.path.join(folder, "*.fits")))]
        for det in sorted({f["det"] for f in frames}):
            fr = sorted([f for f in frames if f["det"] == det], key=lambda f: f["date"])
            if len(fr) < 2:
                print(target, det, "only", len(fr), "frame, skipped"); continue
            outdir = os.path.join(out_root, target, det)
            render(fr, outdir)
            ref = fr[0]
            meta = []
            for i, f in enumerate(fr, start=1):
                meta.append({"id": f"{target}-{det}-{i:03d}", "obsTime": f["date"], "detector": det,
                             "wavelengthUm": round(f["wave"], 3), "release": f["release"],
                             "badPixelFraction": round(f["flagfrac"], 3), "file": f["name"],
                             "png": f"data/cache/{target}/{det}/raw_{i:03d}.png",
                             "pngDiff": f"data/cache/{target}/{det}/diff_{i:03d}.png"})
            json.dump({"target": target, "detector": det, "imageSize": {"height": ref["data"].shape[0], "width": ref["data"].shape[1]},
                       "frames": meta}, open(os.path.join(outdir, "frames.json"), "w"), indent=1)
            print(f"{target} {det}: {len(fr)} frames, {ref['data'].shape[1]}x{ref['data'].shape[0]} -> {outdir}")