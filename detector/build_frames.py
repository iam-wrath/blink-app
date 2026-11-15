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


DISPLAY_PX = 480   # PNGs are smoothly enlarged to about this size (SPHEREx cutouts are only ~60 px across)


def fill_masked(a):
    """Fill flagged/missing pixels so they don't show as black holes:
    small holes (bad pixels) get the local median, big holes (saturated star cores) the brightest neighbour."""
    bad = ~np.isfinite(a)
    if not bad.any() or bad.all():
        return a
    a = a.copy()
    labels, n = ndimage.label(bad)
    sizes = ndimage.sum(bad, labels, range(1, n + 1))
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    big = np.isin(labels, 1 + np.flatnonzero(sizes > 4)) & ~np.isin(labels, edge[edge > 0])
    small = bad & ~big & ~np.isin(labels, edge[edge > 0])
    a[bad & ~big & ~small] = np.nanmedian(a)   # empty strips at the edges (after alignment): background
    if small.any():
        med = ndimage.median_filter(np.where(bad, np.nanmedian(a), a), size=3)
        a[small] = med[small]
    for _ in range(50):   # grow the brightest edge value inwards until big holes are filled
        hole = ~np.isfinite(a)
        if not hole.any():
            break
        grown = ndimage.maximum_filter(np.where(hole, -np.inf, a), size=3)
        a = np.where(hole & np.isfinite(grown), grown, a)
    return np.where(np.isfinite(a), a, np.nanmedian(a))


def edge_gap(a):
    """Missing pixels connected to the image border (no data there after alignment)."""
    labels, _ = ndimage.label(~np.isfinite(a))
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    return np.isin(labels, edge[edge > 0])


def save_png(arr, path, lo, hi, fill=0.0, scale=1, symmetric=False):
    """fill = grey level (0..1) for masked/missing pixels: black for raw, mid-grey for diff.
    asinh stretch (faint detail visible, bright stars not blown out), then enlarged `scale` times (bicubic)."""
    if symmetric:   # diff: -lim..lim -> 0..1 (linear), grey = no change
        img = 0.5 + 0.5 * np.clip(arr / (hi + 1e-9), -1, 1)
    else:
        x = np.clip((arr - lo) / (hi - lo + 1e-9), 0, 1)
        img = np.arcsinh(10 * x) / np.arcsinh(10)
    img = np.where(np.isfinite(arr), img, fill)
    im = Image.fromarray((np.flipud(img) * 255).astype("uint8"))   # flip once, here only (PNG origin top-left)
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.BICUBIC)
    im.save(path)


def visits(dates, max_days=2.0):
    """Group date-sorted ISO dates into visits: frames within max_days of the visit's first frame.
    SPHEREx sees a patch several times within hours, then comes back weeks or months later.
    Returns a list of index lists."""
    from astropy.time import Time
    mjd = [Time(d.rstrip("Z")).mjd for d in dates]
    groups = [[0]] if mjd else []
    for i in range(1, len(mjd)):
        if mjd[i] - mjd[groups[-1][0]] <= max_days:
            groups[-1].append(i)
        else:
            groups.append([i])
    return groups


def upscale_for(shape):
    """Whole-number enlargement so the PNG is about DISPLAY_PX across (1 = no enlargement)."""
    return max(1, min(8, round(DISPLAY_PX / max(shape))))


def render(fr, outdir, prefix="", groups=None):
    """Align frames (already loaded with load() and sorted by date) to the first one and save
    <prefix>raw_NNN.png and <prefix>diff_NNN.png in outdir. Returns the (raw, diff) path pairs, in order.
    groups: optional list of index lists (e.g. from visits()); each group is co-added (averaged after
    alignment) into one output frame, which improves signal-to-noise for faint targets.
    PNGs are enlarged upscale_for(first frame's shape) times.
    Used by build_frames.py (below) and by the frame service (main.py)."""
    os.makedirs(outdir, exist_ok=True)
    scale = upscale_for(fr[0]["data"].shape)
    ref = fr[0]
    # align every frame to the first (earliest) one
    aligned = [ref["data"]]
    for f in fr[1:]:
        a, _ = reproject_interp((f["data"], f["wcs"]), ref["wcs"], shape_out=ref["data"].shape)
        aligned.append(a)
    # remove each frame's own background level, so brightness steps don't flicker
    aligned = [a - np.nanmedian(a) for a in aligned]
    if groups:   # co-add: average the aligned frames of each group (noise drops by about sqrt(n))
        aligned = [np.nanmean(np.stack([aligned[i] for i in g]), axis=0) for g in groups]
    # what we show: bad pixels filled, very light smoothing against single-pixel noise
    shown = [ndimage.gaussian_filter(fill_masked(a), 0.6) for a in aligned]
    # ONE shared brightness scale for all raw frames: background (median) is black
    vals = np.concatenate([s.ravel() for s in shown])
    lo, hi = np.percentile(vals, [50, 99.8])
    # difference frames: each minus the first, symmetric scale
    diffs = []
    for a, s in zip(aligned, shown):
        d = s - shown[0]
        # remove the slow background gradient (sky background differs between dates)
        d = d - ndimage.median_filter(d, size=31)
        # strips with no data at the edges (after alignment) show as grey; filled bad pixels are kept
        diffs.append(np.where(edge_gap(a) | edge_gap(aligned[0]), np.nan, d))
    dv = np.concatenate([d[np.isfinite(d)] for d in diffs[1:]]) if len(diffs) > 1 else np.array([])
    # scale from the noise level (robust sigma), so noise stays a faint grain and only real changes stand out
    sig = 1.4826 * np.median(np.abs(dv - np.median(dv))) if dv.size else 0.0
    lim = max(np.percentile(np.abs(dv), 99.5) if dv.size else 0.0, 6 * sig) or 1.0
    paths = []
    for i, (s, d) in enumerate(zip(shown, diffs), start=1):
        raw_p = os.path.join(outdir, f"{prefix}raw_{i:03d}.png")
        diff_p = os.path.join(outdir, f"{prefix}diff_{i:03d}.png")
        save_png(s, raw_p, lo, hi, scale=scale)
        save_png(d, diff_p, 0, lim, fill=0.5, scale=scale, symmetric=True)
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