"""
preview_local.py  -  make time-lapse previews from SPHEREx cutouts you downloaded in the browser

Put each target's .fits files in its own folder:
    data/raw/wise_0855/        data/raw/barnard_s_star/     data/raw/epsilon_indi_b/
    data/raw/rw_aurigae/       data/raw/r_draconis/
Then run (from the project root):
    python preview_local.py
It sorts the frames by observation date (read from each file), aligns them to the first,
uses one brightness scale, and saves data/preview/<target>.gif, _first.png, _last.png
with a red cross at the target position from contract/targets.json. No internet needed.
"""
import glob
import logging
import json
import os

from astropy.io import fits
from astropy.time import Time

from astropy import log as astropy_log
astropy_log.setLevel("WARNING")  # hide the harmless 'SIP distortion' INFO messages
logging.getLogger("astropy").setLevel(logging.WARNING)

import download_targets as dt  # reuses its align / picture code


def frame_info(path, ra, dec):
    h = fits.getheader(path, "IMAGE")
    t = Time(h.get("MJD-AVG", h.get("MJD-OBS")), format="mjd").isot[:19] + "Z"
    try:
        from irsa import read_frame_info
        wl, flags = read_frame_info(path, ra, dec)
    except Exception:
        wl, flags = float("nan"), None
    return {"path": path, "obsTime": t, "wavelengthUm": wl, "flags": flags}


def main():
    targets = json.load(open(os.path.join("contract", "targets.json")))
    for t in targets:
        folder = os.path.join("data", "raw", dt.slug(t["name"]))
        files = sorted(glob.glob(os.path.join(folder, "*.fits")))
        if not files:
            print(f"{t['name']:15s} no files in {folder}\\ (skipped)")
            continue
        frames = []
        for p in files:
            try:
                frames.append(frame_info(p, t["ra"], t["dec"]))
            except Exception as e:
                print(f"  skip {p}: {e}")
        frames.sort(key=lambda f: f["obsTime"])
        dt.find_cutouts = lambda *a, **k: frames  # feed the local files to the same code
        r = dt.do_target(t, "local", None)
        if r:
            print(f"  -> {r['frames']} frames, {r['from'][:10]} to {r['to'][:10]}, {r['wavelengths']}")


if __name__ == "__main__":
    main()