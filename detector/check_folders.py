"""Check every sub-folder of data/raw: what is in it, and is it the right target?
Run from the detector folder:  python check_folders.py ../data/raw
"""
import sys, glob, os, warnings
import numpy as np
warnings.filterwarnings("ignore")
from astropy.io import fits
from astropy.wcs import WCS

# approximate positions (from memory: confirm in SIMBAD). Barnard's Star has moved ~0.08 deg since 2000.
TARGETS = {
    "WISE 0855":      (133.7951, -7.2451,  ["wise"]),
    "Barnard's Star": (269.4521,  4.6934,  ["barnard"]),
    "Epsilon Indi B": (330.8400, -56.7900, ["indi"]),
    "RW Aurigae":     (76.9600,  30.5100,  ["aur"]),
    "R Draconis":     (248.1700, 66.7550,  ["dra"]),
}


def sep_deg(ra1, d1, ra2, d2):
    r1, r2, a, b = map(np.radians, (ra1, ra2, d1, d2))
    c = np.sin(a) * np.sin(b) + np.cos(a) * np.cos(b) * np.cos(r1 - r2)
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def read_info(path):
    """Return (date, detector, shape, ra, dec, wavelength) for one file."""
    h = fits.open(path)
    hd = h["IMAGE"].header
    ny, nx = h["IMAGE"].data.shape
    w = WCS(hd, fobj=h)
    ra, dec = w.pixel_to_world_values(nx // 2, ny // 2)
    ww = WCS(hd, fobj=h, key="W")
    wl = ww.pixel_to_world_values(nx // 2, ny // 2)[0]
    result = (hd["DATE-OBS"][:10], hd.get("DETECTOR"), (ny, nx), float(ra), float(dec), float(wl))
    h.close()
    return result


root = sys.argv[1] if len(sys.argv) > 1 else "../data/raw"
pattern = os.path.join(root, "**", "*.fits")
folders = sorted({os.path.dirname(p) for p in glob.glob(pattern, recursive=True)})
if not folders:
    sys.exit("No .fits files found under " + os.path.abspath(root))

for folder in folders:
    name = os.path.basename(folder)
    files = sorted(glob.glob(os.path.join(folder, "*.fits")))
    info = []
    bad = []
    for f in files:
        try:
            info.append(read_info(f))
        except Exception as e:
            bad.append((os.path.basename(f), str(e)[:60]))

    print("=" * 70)
    print(f"FOLDER {name}: {len(files)} files, {len(bad)} unreadable")
    for b in bad:
        print("   cannot read:", b)
    if not info:
        continue

    dates = sorted(i[0] for i in info)
    dets = sorted({f"D{i[1]}" for i in info})
    shapes = sorted({i[2] for i in info})
    ra = float(np.median([i[3] for i in info]))
    dec = float(np.median([i[4] for i in info]))
    wls = [i[5] for i in info]
    print(f"  dates      : {dates[0]} to {dates[-1]}")
    print(f"  detectors  : {dets}")
    print(f"  image sizes: {shapes}")
    print(f"  wavelength : {min(wls):.2f} to {max(wls):.2f} um")
    print(f"  centre     : RA {ra:.4f}  Dec {dec:.4f}")

    best = min(TARGETS, key=lambda t: sep_deg(ra, dec, TARGETS[t][0], TARGETS[t][1]))
    s = sep_deg(ra, dec, TARGETS[best][0], TARGETS[best][1])
    print(f"  nearest target: {best} ({s:.2f} deg away)")
    if s > 0.3:
        print("  >>> WARNING: centre is not near any of the five targets. Wrong coordinates?")
    elif not any(k in name.lower() for k in TARGETS[best][2]):
        print(f"  >>> WARNING: the folder is called '{name}' but the data is centred on {best}. Rename the folder or re-download.")
    else:
        print("  OK: folder name matches the sky position")