"""
detector/irsa.py  -  SPHEREx image finder (Blink Comparator v2, steps A1 + A2, handoff H1)

find_cutouts(ra, dec, fov_deg, detector) -> list of dicts, sorted by obsTime:
    { "url": ..., "obsTime": "2025-05-16T21:48:42Z", "wavelengthUm": 1.35,
      "detector": "D2", "release": "DR1",
      # extras (harmless for the contract):
      "obsId": ..., "path": "data/raw/....fits", "flags": 0 }

The TAP query is copied from IRSA's SPHEREx cutout tutorial
(caltech-ipac.github.io/irsa-tutorials/spherex-cutouts). Only its column names are used.

Offline: if IRSA can't be reached, find_cutouts() falls back to the .fits files already in
data/raw/<target>/ (the target nearest to ra/dec in contract/targets.json). Force it with
    set BLINK_OFFLINE=1        (Windows cmd)   or   $env:BLINK_OFFLINE="1"   (PowerShell)

Test (from the project root):
    python detector/irsa.py                     # WISE 0855, 0.1 deg, D2, downloads up to 3 files
    python detector/irsa.py 133.7951 -7.2451 0.1 D2 --all     # download every frame
    python detector/irsa.py 133.7951 -7.2451 0.1 D2 --no-download
"""
import concurrent.futures
import hashlib
import os
import re
import sys
import time
import urllib.request
import warnings

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astropy.coordinates import SkyCoord
import astropy.units as u

warnings.filterwarnings("ignore")
from astropy import log as _astropy_log
_astropy_log.setLevel("WARNING")  # hide harmless "SIP distortion" INFO notes

RAW_DIR = os.path.join("data", "raw")


def _bandpass(detector):
    """'D2', 'd2', '2' or 'SPHEREx-D2' -> 'SPHEREx-D2'."""
    d = str(detector).upper().replace("SPHEREX-", "")
    if not d.startswith("D"):
        d = "D" + d
    if d not in {f"D{i}" for i in range(1, 7)}:
        raise ValueError(f"detector must be D1..D6, got {detector!r}")
    return "SPHEREx-" + d, d


def query_images(ra, dec, fov_deg, detector):
    """Ask IRSA which SPHEREx images cover (ra, dec) for one detector.
    Returns an astropy Table with columns uri (cutout URL) and time_bounds_lower (MJD)."""
    from astroquery.ipac.irsa import Irsa
    bandpass, _ = _bandpass(detector)
    query = f"""
    SELECT
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra},{dec}d&size={fov_deg}' AS uri,
        p.time_bounds_lower
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {ra}, {dec}), p.poly)
          AND p.energy_bandpassname = '{bandpass}'
    ORDER BY p.time_bounds_lower
    """
    return Irsa.query_tap(query).to_table()


def _release_from_url(url):
    """Release name from the archive path, e.g. .../spherex/qr2/level2/... -> 'QR2', .../dr1/... -> 'DR1'."""
    m = re.search(r"/spherex/([A-Za-z0-9]+)/", url)
    return m.group(1).upper() if m else "unknown"


def _obsid_from_url(url):
    """level2_2025W20_2D_0234_3D3_spx_l2b-....fits -> '2025W20_2D_0234_3' (best effort)."""
    name = url.split("?")[0].rsplit("/", 1)[-1]
    m = re.search(r"level2_(\d{4}W\d+_\w+?_\d+_\d+)", name)
    return m.group(1) if m else name.replace(".fits", "")


def _download(url, path, tries=3, timeout=120):
    """Download url to path. Keeps an existing file. Returns path or None on failure."""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    tmp = path + ".part"
    for attempt in range(1, tries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 16)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(tmp, path)
            return path
        except Exception as e:  # network trouble: retry, then give up on this file
            if os.path.exists(tmp):
                os.remove(tmp)
            if attempt == tries:
                print(f"  skip (download failed): {url[:90]}... ({e})")
                return None
            time.sleep(2 * attempt)


def read_frame_info(path, ra, dec):
    """Wavelength (um) and FLAGS value at (ra, dec), read from a downloaded cutout.
    Wavelength method copied from the IRSA tutorial (spectral WCS key 'W')."""
    with fits.open(path) as h:
        hdr = h["IMAGE"].header
        x, y = WCS(hdr).world_to_pixel(SkyCoord(ra * u.deg, dec * u.deg))
        spectral_wcs = WCS(hdr, fobj=h, key="W")
        spectral_wcs.sip = None
        wavelength, _bandwidth = spectral_wcs.pixel_to_world(x, y)
        wl = float(wavelength.to(u.micrometer).value)
        flags = 0
        if "FLAGS" in h:
            fl = h["FLAGS"].data
            xi, yi = int(round(float(x))), int(round(float(y)))
            if 0 <= yi < fl.shape[0] and 0 <= xi < fl.shape[1]:
                flags = int(fl[yi, xi])
    return wl, flags


def _find_cutouts_online(ra, dec, fov_deg, detector, download=True, limit=None, outdir=RAW_DIR, workers=6):
    """One dict per SPHEREx image covering (ra, dec), sorted by obsTime.
    download=True  : saves each cutout to data/raw/ (skips failures) and fills wavelengthUm + flags.
    download=False : metadata only (fast); wavelengthUm and flags are None.
    limit          : only take the first N images (by date)."""
    _, det = _bandpass(detector)
    table = query_images(ra, dec, fov_deg, detector)
    rows = []
    for r in table:
        url = str(r["uri"])
        t = Time(float(r["time_bounds_lower"]), format="mjd", scale="utc")
        rows.append({
            "url": url,
            "obsTime": t.isot[:19] + "Z",
            "wavelengthUm": None,
            "detector": det,
            "release": _release_from_url(url),
            "obsId": _obsid_from_url(url),
            "path": None,
            "flags": None,
        })
    rows.sort(key=lambda d: d["obsTime"])
    if limit:
        rows = rows[:limit]
    if not download or not rows:
        return rows

    os.makedirs(outdir, exist_ok=True)
    tag = hashlib.md5(f"{ra:.5f},{dec:.5f},{fov_deg},{det}".encode()).hexdigest()[:8]

    def fetch(row):
        path = os.path.join(outdir, f"{tag}_{row['obsId']}_{det}.fits")
        got = _download(row["url"], path)
        if got:
            try:
                row["wavelengthUm"], row["flags"] = read_frame_info(got, ra, dec)
                row["path"] = got
            except Exception as e:
                print(f"  skip (unreadable file): {got} ({e})")
                os.remove(got)
        return row

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        rows = list(ex.map(fetch, rows))
    return [r for r in rows if r["path"]]  # only frames we actually have


# ---------------------------------------------------------------------------
# Offline fallback: frames already downloaded into data/raw/<target>/
# ---------------------------------------------------------------------------
def _slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def find_local(ra, dec, fov_deg, detector, limit=None, raw_dir=RAW_DIR, targets_path=os.path.join("contract", "targets.json")):
    """Same output as find_cutouts, but from .fits files already on disk (no internet).
    Uses the folder of the contract/targets.json target nearest to (ra, dec), within one field of view."""
    import glob
    import json
    _, det = _bandpass(detector)
    want = int(det[1])
    here = SkyCoord(ra * u.deg, dec * u.deg)
    folders = []
    try:
        for t in json.load(open(targets_path)):
            sep = here.separation(SkyCoord(t["ra"] * u.deg, t["dec"] * u.deg)).deg
            folders.append((sep, os.path.join(raw_dir, _slug(t["name"]))))
    except OSError:
        pass
    folders = [f for sep, f in sorted(folders) if sep <= max(fov_deg, 0.05)]
    rows = []
    for folder in folders[:1]:
        for path in sorted(glob.glob(os.path.join(folder, "*.fits"))):
            try:
                hdr = fits.getheader(path, "IMAGE")
                file_det = hdr.get("DETECTOR")
                if file_det is not None and int(file_det) != want:
                    continue
                t = Time(hdr.get("MJD-AVG", hdr.get("MJD-OBS")), format="mjd", scale="utc")
                try:
                    wl, flags = read_frame_info(path, ra, dec)
                except Exception:
                    wl, flags = None, None
                name = os.path.basename(path)
                m = re.search(r"/spherex/([A-Za-z0-9]+)/", hdr.get("FILENAME", "") or "")
                rows.append({"url": "file:" + path, "obsTime": t.isot[:19] + "Z", "wavelengthUm": wl,
                             "detector": det, "release": m.group(1).upper() if m else "cached",
                             "obsId": _obsid_from_url(name), "path": path, "flags": flags})
            except Exception as e:
                print(f"  skip unreadable local file {path}: {e}")
    rows.sort(key=lambda d: d["obsTime"])
    return rows[:limit] if limit else rows


def find_cutouts(ra, dec, fov_deg, detector, download=True, limit=None, outdir=RAW_DIR, workers=6):
    """One dict per SPHEREx image covering (ra, dec), sorted by obsTime (handoff H1).
    Asks the IRSA archive first. If IRSA can't be reached (or BLINK_OFFLINE=1 is set),
    returns the frames already saved in data/raw/<target>/ instead, in the same format."""
    if os.environ.get("BLINK_OFFLINE") != "1":
        try:
            return _find_cutouts_online(ra, dec, fov_deg, detector, download=download,
                                        limit=limit, outdir=outdir, workers=workers)
        except Exception as e:
            print(f"  IRSA not reachable ({type(e).__name__}); using frames saved in {RAW_DIR}/")
    rows = find_local(ra, dec, fov_deg, detector, limit=limit)
    if not rows:
        print("  No saved frames for this position/detector either.")
    return rows


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ra, dec, fov, det = (float(args[0]), float(args[1]), float(args[2]), args[3]) if len(args) == 4 \
        else (133.7951, -7.2451, 0.1, "D2")
    dl = "--no-download" not in sys.argv
    lim = None if "--all" in sys.argv else 3
    print(f"Searching SPHEREx {det} images at RA {ra}, Dec {dec}, FOV {fov} deg ...")
    res = find_cutouts(ra, dec, fov, det, download=dl, limit=lim if dl else None)
    print(f"{len(res)} images" + ("" if dl else " (metadata only)"))
    if res and str(res[0]["url"]).startswith("file:"):
        print("(offline: these come from data/raw/)")
    for r in res:
        wl = f"{r['wavelengthUm']:.3f} um" if r["wavelengthUm"] else "   -    "
        print(f"  {r['obsTime']}  {wl}  {r['release']:5s} flags={r['flags']}  {r['obsId']}  {r['path'] or ''}")