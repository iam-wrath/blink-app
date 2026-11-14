"""
make_targets.py  -  Blink Comparator v2, steps A3 + A4

1. Looks up the five test targets in SIMBAD (coordinates + proper motion).
2. Moves each position forward from the catalog year (2000) to SPHEREx's time (2025.6),
   because fast movers like Barnard's Star have drifted several arcminutes since 2000.
3. Writes contract/targets.json   (the presets dropdown, handoff to Kwaku and Jude)
4. Asks IRSA how many SPHEREx images cover each target, per detector D1-D6 (metadata only,
   no downloads), and writes docs/targets.md   (the results table for the pitch).

Run from the project root:
    python make_targets.py                 # everything
    python make_targets.py --no-survey     # only SIMBAD + targets.json (fast)
Needs detector/irsa.py for the survey part.
"""
import json
import os
import sys

import numpy as np
from astropy.time import Time

sys.path.insert(0, "detector")

EPOCH = 2025.6  # middle of the SPHEREx data we see so far

# name shown in the app, SIMBAD identifier, field of view (deg)
TARGETS = [
    ("WISE 0855", "WISE J085510.83-071442.5", 0.1),
    ("Barnard's Star", "Barnard's star", 0.2),
    ("Epsilon Indi B", "eps Ind B", 0.1),
    ("RW Aurigae", "RW Aur", 0.1),
    ("R Draconis", "R Dra", 0.1),
]
# Used only if SIMBAD cannot be reached (from the guide; no proper-motion correction).
FALLBACK = {"WISE 0855": (133.7951, -7.2451)}


def _col(table, *names):
    """Find a column whatever its capitalisation in this astroquery version."""
    low = {c.lower(): c for c in table.colnames}
    for n in names:
        if n.lower() in low:
            return table[low[n.lower()]][0]
    raise KeyError(f"none of {names} in {table.colnames}")


def simbad_position(ident):
    """(ra, dec, pmra, pmdec, catalog_ra, catalog_dec) with ra/dec moved to EPOCH."""
    from astroquery.simbad import Simbad
    s = Simbad()
    s.add_votable_fields("pmra", "pmdec")
    t = s.query_object(ident)
    if t is None or len(t) == 0:
        raise LookupError(f"SIMBAD found nothing for {ident!r}")
    ra0, dec0 = float(_col(t, "ra")), float(_col(t, "dec"))
    try:
        pmra, pmdec = float(_col(t, "pmra")), float(_col(t, "pmdec"))  # mas/yr, pmra includes cos(dec)
        if not np.isfinite(pmra) or not np.isfinite(pmdec):
            raise ValueError
    except (KeyError, ValueError):
        pmra = pmdec = 0.0
    dt = EPOCH - 2000.0
    dec = dec0 + pmdec * dt / 3.6e6
    ra = (ra0 + pmra * dt / 3.6e6 / np.cos(np.radians(dec0))) % 360
    return ra, dec, pmra, pmdec, ra0, dec0


def main():
    survey = "--no-survey" not in sys.argv
    os.makedirs("contract", exist_ok=True)
    os.makedirs("docs", exist_ok=True)

    presets, notes = [], []
    for name, ident, fov in TARGETS:
        try:
            ra, dec, pmra, pmdec, ra0, dec0 = simbad_position(ident)
            moved = np.hypot(pmra, pmdec) / 1000 * (EPOCH - 2000)
            print(f"{name:15s} RA {ra:.5f}  Dec {dec:+.5f}   (moved {moved:.0f}\" since 2000)")
            notes.append((name, ident, ra0, dec0, pmra, pmdec, moved))
        except Exception as e:
            if name not in FALLBACK:
                print(f"{name:15s} SIMBAD lookup failed: {e}. Fill it in by hand.")
                continue
            ra, dec = FALLBACK[name]
            print(f"{name:15s} SIMBAD failed ({e}); using the guide's position")
            notes.append((name, ident, ra, dec, 0, 0, 0))
        presets.append({"name": name, "ra": round(ra, 5), "dec": round(dec, 5), "fov": fov})

    with open("contract/targets.json", "w") as f:
        json.dump(presets, f, indent=2)
    print("Wrote contract/targets.json")

    lines = ["# The five test targets", "",
             f"Positions from SIMBAD, moved forward to {EPOCH} with SIMBAD's proper motion.", "",
             "| Target | SIMBAD id | Catalog RA, Dec (2000) | Proper motion (mas/yr) | Moved since 2000 | Used RA, Dec |",
             "|---|---|---|---|---|---|"]
    by_name = {p["name"]: p for p in presets}
    for name, ident, ra0, dec0, pmra, pmdec, moved in notes:
        p = by_name[name]
        lines.append(f"| {name} | {ident} | {ra0:.5f}, {dec0:+.5f} | {pmra:.0f}, {pmdec:.0f} | "
                     f"{moved:.0f}\" | {p['ra']}, {p['dec']:+} |")

    if survey:
        from irsa import find_cutouts
        lines += ["", "## How many SPHEREx images cover each target (A4)", "",
                  "| Target | FOV | D1 | D2 | D3 | D4 | D5 | D6 | Date range | Releases | Best detector |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        for p in presets:
            counts, dates, rels = {}, [], set()
            for d in ["D1", "D2", "D3", "D4", "D5", "D6"]:
                try:
                    rows = find_cutouts(p["ra"], p["dec"], p["fov"], d, download=False)
                except Exception as e:
                    print(f"  {p['name']} {d}: query failed ({e})")
                    rows = None
                counts[d] = len(rows) if rows is not None else None
                for r in rows or []:
                    dates.append(r["obsTime"])
                    rels.add(r["release"])
                print(f"  {p['name']:15s} {d}: {counts[d]}")
            ok = {d: c for d, c in counts.items() if c}
            best = max(ok, key=ok.get) if ok else "-"
            rng = f"{min(dates)[:10]} to {max(dates)[:10]}" if dates else "-"
            cells = " | ".join("?" if counts[d] is None else str(counts[d]) for d in counts)
            lines.append(f"| {p['name']} | {p['fov']} | {cells} | {rng} | {', '.join(sorted(rels)) or '-'} | {best} |")
        lines += ["", "## Notes per target (fill in by hand)", "",
                  "- Anything odd (flags, missing frames, saturation):", "",
                  "## Measured motion (A6)", "",
                  "- WISE 0855: moved __ px (__ arcsec) between ____ and ____, direction ____.",
                  "- Barnard's Star: moved __ px between ____ and ____."]

    with open("docs/targets.md", "w") as f:
        f.write("\n".join(lines) + "\n")
    print("Wrote docs/targets.md")


if __name__ == "__main__":
    main()
