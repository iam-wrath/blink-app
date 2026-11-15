from astropy.io import fits
from astropy.wcs import WCS

def load(path, extname="IMAGE"):
    with fits.open(path) as h:
        if extname not in h:
            names = [hdu.name for hdu in h]
            raise ValueError(f"{path} has no part named {extname!r}. Parts found: {names}")
        hdu = h[extname]
        data = hdu.data.astype(float)
        wcs = WCS(hdu.header, fobj=h)
    return data, wcs