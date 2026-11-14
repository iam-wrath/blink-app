// Zoom / pan maths shared by every viewer.
// panX / panY are fractions of the viewer box, so they work at any window size.
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const HOME: View = { zoom: 1, panX: 0, panY: 0 };

export const clampPan = (v: number, zoom: number) => {
  const max = (zoom - 1) / 2;
  return Math.max(-max, Math.min(max, v));
};

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

// Box fraction (0..1) -> image fraction (0..1) under the current view.
export function boxToImage(v: View, fx: number, fy: number) {
  return { u: 0.5 + (fx - 0.5 - v.panX) / v.zoom, w: 0.5 + (fy - 0.5 - v.panY) / v.zoom };
}

// Zoom so the image point under (fx, fy) stays under the cursor.
export function zoomAt(v: View, fx: number, fy: number, nextZoom: number): View {
  const z = clampZoom(nextZoom);
  if (z === 1) return HOME;
  const { u, w } = boxToImage(v, fx, fy);
  return {
    zoom: z,
    panX: clampPan(fx - 0.5 - (u - 0.5) * z, z),
    panY: clampPan(fy - 0.5 - (w - 0.5) * z, z),
  };
}

// Zoom so image fraction (u, w) sits in the middle of the box.
export function centerOn(u: number, w: number, zoom: number): View {
  const z = clampZoom(zoom);
  if (z === 1) return HOME;
  return { zoom: z, panX: clampPan(-(u - 0.5) * z, z), panY: clampPan(-(w - 0.5) * z, z) };
}
