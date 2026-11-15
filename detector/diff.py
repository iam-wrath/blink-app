"""Standalone difference image: A minus B."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage
from reproject import reproject_interp
from loader import load

A_PATH = "../data/region-01/epoch_a1.fits"
B_PATH = "../data/region-01/epoch_b1.fits"
OUT = "out"
THRESH = 6        # detection threshold in local-noise sigmas
MIN_PIXELS = 3    # smaller spots are treated as cosmic rays / hot pixels
os.makedirs(OUT, exist_ok=True)

# 1. Load both epochs and put B on A's pixel grid (kept in memory only)
a, wa = load(A_PATH)
b, wb = load(B_PATH)
b_al, _ = reproject_interp((b, wb), wa, shape_out=a.shape)

mask = np.isfinite(a) & np.isfinite(b_al)
print("overlap:", round(100 * mask.mean(), 1), "% of A's grid")


def robust_sigma(x):
    return 1.4826 * np.median(np.abs(x - np.median(x)))


def norm(x):
    v = x[mask]
    return (x - np.median(v)) / robust_sigma(v)


# 2. Match brightness, then subtract B from A
diff = np.where(mask, norm(a) - norm(b_al), 0.0)

# remove slow background gradients, then measure noise locally
d = diff - ndimage.median_filter(diff, size=31)
sig = 1.4826 * ndimage.median_filter(np.abs(d), size=31)
sig = np.maximum(sig, 0.3 * np.median(sig[mask]))   # floor so flat areas don't explode
z = np.where(mask, d / sig, 0.0)                    # difference in local noise sigmas


# 3. Save PNGs (flipped so row 0 is the bottom, like FITS)
def save_u8(img01, name):
    arr = (np.flipud(np.nan_to_num(img01)) * 255).astype("uint8")
    Image.fromarray(arr).save(os.path.join(OUT, name))


def stretch(x):
    lo, hi = np.nanpercentile(x[mask], [1, 99])
    return np.clip((x - lo) / (hi - lo + 1e-9), 0, 1)


save_u8(np.clip((z + 5) / 10, 0, 1), "diff.png")  # grey = no change
save_u8(stretch(a), "diff_view_a.png")
save_u8(stretch(b_al), "diff_view_b.png")

# 4. List the strongest spots (10 px border ignored)
inner = ndimage.binary_erosion(mask, iterations=10)
zz = np.where(inner, z, 0.0)
cands = []
for sign, kind in [(1, "A brighter"), (-1, "B brighter")]:
    labels, n = ndimage.label(sign * zz > THRESH)
    for i in range(1, n + 1):
        region = labels == i
        if region.sum() < MIN_PIXELS:   # single pixels are cosmic rays / hot pixels
            continue
        peak = (sign * zz)[region].max()
        cy, cx = ndimage.center_of_mass(region)
        cands.append((peak, kind, cx, cy, int(region.sum())))
cands.sort(reverse=True)

ny = a.shape[0]
print(f"{len(cands)} spots beyond {THRESH} sigma (at least {MIN_PIXELS} pixels). Top 15:")
print("peak_sigma  kind          x     y  (PNG row)  npix   RA, Dec")
for peak, kind, cx, cy, npix in cands[:15]:
    sky = wa.pixel_to_world(cx, cy)
    print(f"{peak:8.1f}  {kind:11s} {cx:5.0f} {cy:5.0f}  ({ny - 1 - cy:5.0f})  {npix:4d}   "
          f"{sky.ra.deg:.5f}, {sky.dec.deg:.5f}")
print("saved PNGs in", os.path.abspath(OUT))