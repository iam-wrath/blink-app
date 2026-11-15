# Data notes: SPHEREx cutouts, five targets

Raw files: `data/raw/<target>/`. Generated pictures: `data/cache/<target>/<detector>/`.
Neither folder is in git.

## File layout (same in every file)

| Part | Name     | Type        | Contents                              |
|------|----------|-------------|---------------------------------------|
| 0    | PRIMARY  | PrimaryHDU  | Header only, no data                  |
| 1    | IMAGE    | ImageHDU    | The science image (float32)           |
| 2    | FLAGS    | ImageHDU    | Per-pixel quality flags (int32)       |
| 3    | VARIANCE | ImageHDU    | Per-pixel noise estimate              |
| 4    | ZODI     | ImageHDU    | Zodiacal light (sky background) model |
| 5    | EPSF     | BinTableHDU | Table, 451 rows                       |
| 6    | WCS-WAVE | BinTableHDU | Table, 1 row (wavelength lookup)      |

- Parts 1 to 4 share one pixel grid.
- DATE-OBS, MJD-OBS and the sky coordinates (CTYPE/CRVAL, RA---TAN-SIP) are in the IMAGE header.
- Pixel scale is about 6.1 arcsec per pixel.
- Wavelength is not a single header number. It is a per-pixel lookup stored as a second
  coordinate system. Read it at the image centre with `WCS(hd, fobj=h, key="W")`.
- Flag bit 21 is set on about 99% of pixels in these crowded fields. Do not treat it as bad.
  Mask every other bit.
- Image sizes can differ by one pixel inside one target (58 vs 59), so align every frame
  to the earliest one before comparing.

## Targets

| Folder          | Detector | Frames | Size   | Dates                    | Wavelength (um) | Centre (RA, Dec)    | Checker |
|-----------------|----------|--------|--------|--------------------------|-----------------|---------------------|---------|
| wise            | D6       | 15     | 58-59  | 2025-05-05 to 2026-05-11 | 4.41 to 5.00    | 133.7605, -7.2420   | OK      |
| epsilon_indi_b  | D2       | 15     | 59x59  |                          |                 |                     |         |
| r_draconis      | D2       | 15     | 59x59  |                          |                 |                     |         |
| rw_aurigae      | D2       | 13     | 59x59  |                          |                 |                     |         |
| barnard_s_star  |          |        |        |                          |                 |                     |         |

Fill the blanks from the check_folders.py output.

## Findings

- WISE 0855 data is on detector D6, not D2. The preset and the default detector must use D6.
- The WISE centre is 0.03 degrees from the catalog position, which fits its fast motion.
- An earlier r_draconis set (14 files, 117x117, D2, 2025-08-21 to 2026-09-22) was centred on
  RA 269.446, Dec +4.767, which is Barnard's Star. Albert confirmed the folder contents and we
  kept them. The folder now holds a 15-frame set, so recheck its centre with the checker.
- Barnard's Star motion, measured on that earlier set: about +8.4 arcsec/yr in Dec and
  about -3.3 arcsec/yr in RA*cos(Dec). That is roughly 9 arcsec/yr, or 1.6 pixels over 13 months.
  Frame-to-frame scatter is about 1 arcsec, so the RA part is unreliable.

## Code (detector/)

- `loader.py`: `load(path)` returns the IMAGE array and its WCS.
- `check_folders.py`: summarises each target folder and checks its sky position.
- `build_frames.py`: masks bad pixels, aligns frames to the earliest, applies one shared
  brightness scale, and saves raw and diff PNGs plus frames.json.
- Diff mode compares each frame with the first, even when wavelengths differ.
  Colour differences can look like motion.

## Open items

- Record the checker output for all five targets.
- Look at the first and last raw PNG and the last diff PNG for each target.
- Copy the final numbers into docs/targets.md.