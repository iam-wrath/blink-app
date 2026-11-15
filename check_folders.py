"""
check_folders.py  -  check that every .fits file in data/raw/<target>/ really shows that target

For each file it reads where the picture is centred on the sky (from the file itself)
and which date it was taken, then finds the nearest target in contract/targets.json.
Run from the project root:
    python check_folders.py          # report only, changes nothing
    python check_folders.py --fix    # move misplaced files into the right folder
No internet needed.
"""
import glob
import json
import os
import re
import shutil
import sys
import warnings

from astropy import log as astropy_log
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
import astropy.units as u

warnings.filterwarnings("ignore")
astropy_log.setLevel("WARNING")


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def main():
    fix = "--fix" in sys.argv
    targets = json.load(open(os.path.join("contract", "targets.json")))
    tcoords = {slug(t["name"]): SkyCoord(t["ra"] * u.deg, t["dec"] * u.deg) for t in targets}
    problems = 0
    for folder in sorted(glob.glob(os.path.join("data", "raw", "*"))):
        if not os.path.isdir(folder):
            continue
        name = os.path.basename(folder)
        files = sorted(glob.glob(os.path.join(folder, "*.fits")))
        if not files:
            continue
        print(f"\n{name}: {len(files)} files")
        dates = []
        for f in files:
            try:
                h = fits.getheader(f, "IMAGE")
                ny, nx = h["NAXIS2"], h["NAXIS1"]
                c = WCS(h).pixel_to_world((nx - 1) / 2, (ny - 1) / 2)
                d = Time(h.get("MJD-AVG", h.get("MJD-OBS")), format="mjd").iso[:10]
                dates.append(d)
            except Exception as e:
                print(f"  ?? {os.path.basename(f)}: unreadable ({e})")
                problems += 1
                continue
            best = min(tcoords, key=lambda k: c.separation(tcoords[k]).deg)
            sep = c.separation(tcoords[best]).deg
            ok = best == name and sep < 0.1
            if not ok:
                problems += 1
                print(f"  WRONG FOLDER: {os.path.basename(f)}  centre RA {c.ra.deg:.3f} Dec {c.dec.deg:+.3f}  "
                      f"date {d}  -> belongs to {best} ({sep * 60:.1f}' away)")
                if fix and sep < 0.1:
                    dest = os.path.join("data", "raw", best)
                    os.makedirs(dest, exist_ok=True)
                    shutil.move(f, os.path.join(dest, os.path.basename(f)))
                    print(f"     moved to {dest}")
        if dates:
            first = os.path.basename(files[0])
            h = fits.getheader(files[0], "IMAGE")
            c = WCS(h).pixel_to_world((h["NAXIS1"] - 1) / 2, (h["NAXIS2"] - 1) / 2)
            print(f"  dates {min(dates)} to {max(dates)}; first file centred on RA {c.ra.deg:.3f}, Dec {c.dec.deg:+.3f}")
    print("\nAll files are in the right folders." if problems == 0 else
          f"\n{problems} problem(s) found." + ("" if fix else " Run with --fix to move misplaced files."))


if __name__ == "__main__":
    main()
