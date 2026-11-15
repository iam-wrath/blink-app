import sys
from loader import load

paths = sys.argv[1:] or [
    "../data/region-01/epoch_a1.fits",
    "../data/region-01/epoch_b1.fits",
]

for path in paths:
    data, wcs = load(path)
    ny, nx = data.shape
    print("====", path)
    print("shape:", data.shape)
    print("crpix:", wcs.wcs.crpix)
    print("crval:", wcs.wcs.crval)
    print("center:", wcs.pixel_to_world(nx // 2, ny // 2))
    print("corner (0, 0):", wcs.pixel_to_world(0, 0))
    print(f"corner ({nx - 1}, {ny - 1}):", wcs.pixel_to_world(nx - 1, ny - 1))