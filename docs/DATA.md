# Data sources

## SPHEREx images
- NASA SPHEREx via NASA/IPAC IRSA (irsa.ipac.caltech.edu), releases DR1 and QR3.
- Found with IRSA's TAP service (query from IRSA's SPHEREx cutout tutorial).
  Query results and download pages: docs/archive_queries/.
- Cutouts 0.1° (Barnard's Star 0.2°) centred on each target's 2025.6 position.
- Bands: D6 for WISE 0855, D2 for the others.
- Offline: detector/irsa.py falls back to the saved frames in data/raw/ when IRSA is unreachable.

## Target positions
- WISE 0855: SIMBAD (via CfA Sesame mirror), Kirkpatrick et al. 2021. Checked: agrees to 0.8".
- Barnard's Star, RW Aur: Gaia DR3 values (Wikipedia). Barnard's checked against the NASA Exoplanet Archive.
- Epsilon Indi B: McCaughrean et al. 2004 (A&A 413, 1029), 2MASS position at epoch 1999.855.
- R Dra: British Astronomical Association VSS.
- SIMBAD Strasbourg was down on 14 Nov 2026; all positions moved to 2025.6 using proper motion.