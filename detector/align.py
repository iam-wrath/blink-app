import os
import numpy as np
from PIL import Image
from reproject import reproject_interp
from loader import load

A_PATH = "../data/region-01/epoch_a1.fits"
B_PATH = "../data/region-01/epoch_b1.fits"
OUT = "out"
os.makedirs(OUT, exist_ok=True)

a, wa = load(A_PATH)
b, wb = load(B_PATH)

# Re-project B onto A's pixel grid
b_aligned, footprint = reproject_interp((b, wb), wa, shape_out=a.shape)

covered = footprint > 0
print("B covers", round(100 * covered.mean(), 1), "% of A's grid")
np.save(os.path.join(OUT, "b_aligned.npy"), b_aligned)

# Same brightness stretch for every picture, based on A
lo, hi = np.nanpercentile(a, [1, 99.5])

def to_u8(img):
    x = np.clip((img - lo) / (hi - lo), 0, 1)
    x = np.arcsinh(10 * x) / np.arcsinh(10)
    x = np.nan_to_num(x, nan=0.0)
    return (x * 255).astype(np.uint8)

ua, ub, ub_raw = to_u8(a), to_u8(b_aligned), to_u8(b)

def save(arr, name):
    Image.fromarray(np.flipud(arr)).save(os.path.join(OUT, name))  # flip so row 0 is at the bottom, like FITS

save(ua, "epoch_a1.png")
save(ub, "epoch_b1_aligned.png")
save(ub_raw, "epoch_b1_original.png")                      # before alignment, for comparison
save(np.dstack([ua, ub, ub]), "overlay_a_red_b_cyan.png")  # stars that line up look white/grey

# Rough numeric check: leftover shift in whole pixels (should be 0, 0)
def residual_shift(x, y):
    x = np.nan_to_num(x - np.nanmedian(x))
    y = np.nan_to_num(y - np.nanmedian(y))
    cc = np.fft.ifft2(np.fft.fft2(x) * np.conj(np.fft.fft2(y))).real
    iy, ix = np.unravel_index(np.argmax(cc), cc.shape)
    h, w = cc.shape
    return (ix - w if ix > w // 2 else ix), (iy - h if iy > h // 2 else iy)

print("residual shift (x, y) after alignment:", residual_shift(a, b_aligned))
print("residual shift (x, y) before alignment:", residual_shift(a[:, :b.shape[1]], b))
print("saved PNGs in", os.path.abspath(OUT))
