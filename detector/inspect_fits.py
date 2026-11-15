import sys
from astropy.io import fits

path = sys.argv[1] if len(sys.argv) > 1 else "../data/region-01/epoch_a.fits"

KEYS = ["DATE-OBS", "MJD-OBS", "CTYPE1", "CTYPE2",
        "CRVAL1", "CRVAL2", "CRPIX1", "CRPIX2", "CD1_1", "CDELT1"]

with fits.open(path) as h:
    h.info()  # lists every part of the filec
    print()
    for i, hdu in enumerate(h):
        shape = hdu.data.shape if hdu.data is not None else None
        print(f"--- part {i}: {type(hdu).__name__}, data shape = {shape}")
        for k in KEYS:
            if k in hdu.header:
                print(f"    {k} = {hdu.header[k]}")