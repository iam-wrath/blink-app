# Five test targets: SPHEREx coverage (A4)

| Target | Band | Frames downloaded (in archive) | Date range | Wavelengths |
|---|---|---|---|---|
| WISE 0855 | D6 | 15 (45) | 2025-05-05 to 2026-05-11 | 4.42–5.00 µm |
| Barnard's Star | D2 | 14 (61) | 2025-08-21 to 2026-09-22 | 1.10–1.61 µm |
| Epsilon Indi B | D2 | 16 (93) | 2025-04-24 to 2026-10-02 | 1.11–1.56 µm |
| RW Aurigae | D2 | 13 (55) | 2025-09-08 to 2026-09-10 | 1.17–1.59 µm |
| R Draconis | D2 | 16 (89) | 2025-06-08 to 2026-06-23 | 1.20–1.66 µm |

## Odd things
- WISE 0855 needs D6: a ~250 K brown dwarf is invisible below ~3 µm (J ≈ 25).
- SPHEREx visits each spot in bursts of a few days, about every 6 months.
- Frames come from two releases: DR1 and QR3.
- Each frame is at a slightly different wavelength, so brightness changes a little between frames.
- Positions moved to 2025.6 (Barnard's Star ~4.4′, WISE 0855 ~3.5′ from J2000).
- Only one band was searched per target, so "best detector" was not compared.

## Measured motion (A6)
- **Barnard's Star** (14 frames, D2): moves north at every visit: +3.6" Aug 2025→Mar 2026, +4" Mar→Sep 2026.
  Total ~8–9" (≈1.5 px) in 13 months; catalogue predicts ~11". Right direction, ~80% of the expected amount.
- **WISE 0855** (D6): detected at 4.42–4.73 µm (Nov 2025, Dec 2025, Apr 2026; SNR 5–8) but not at
  4.86–5.01 µm (both May visits, SNR ~2), so the usable span is Nov 2025→Apr 2026.
  Shift ≈ 1 px west, matching the catalogue direction; amount uncertain (6 ± 3"). One glitch frame removed.
  Lesson: compare frames at similar wavelengths (the brightness changes with wavelength).