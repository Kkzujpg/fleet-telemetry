// Drawn vehicle glyph for the fleet map, replacing the plain circle layer.
// A DOM element (maplibregl.Marker), not a rasterized symbol layer, so the
// heading rotation and status color can update every animation frame via
// cheap CSS custom properties instead of re-rendering a canvas icon.
const GLYPH_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" class="vehicle-marker-glyph" aria-hidden="true">
  <path
    d="M12 2 20.6 20.2a0.9 0.9 0 0 1-1.24 1.18L12 17.9l-7.36 3.48a0.9 0.9 0 0 1-1.24-1.18L12 2Z"
    fill="var(--marker-color, var(--status-offline))"
    stroke="oklch(12% 0.01 265 / 0.65)"
    stroke-width="1.25"
    stroke-linejoin="round"
  />
</svg>`;

export interface VehicleMarkerElement {
  el: HTMLDivElement;
  setColor: (color: string) => void;
  setHeading: (headingDeg: number) => void;
  setSelected: (selected: boolean) => void;
}

/** SVG markup above is static and authored here, never built from device data - safe to set via innerHTML once. */
export function createVehicleMarkerElement(): VehicleMarkerElement {
  const el = document.createElement("div");
  el.className = "vehicle-marker";
  el.innerHTML = GLYPH_SVG;
  const glyph = el.querySelector<SVGElement>(".vehicle-marker-glyph")!;

  return {
    el,
    setColor(color: string) {
      el.style.setProperty("--marker-color", color);
      el.style.setProperty("--marker-glow", color);
    },
    setHeading(headingDeg: number) {
      glyph.style.transform = `rotate(${headingDeg}deg)`;
    },
    setSelected(selected: boolean) {
      el.dataset.selected = selected ? "true" : "false";
    },
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Compass bearing in degrees (0 = north, clockwise) from point a to point b. */
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const deltaLambda = toRad(b.lng - a.lng);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Below this, two points are close enough that a computed bearing is GPS noise, not real movement. */
export const HEADING_MIN_DELTA_DEG = 0.00002;

export function hasMoved(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) > HEADING_MIN_DELTA_DEG || Math.abs(a.lng - b.lng) > HEADING_MIN_DELTA_DEG;
}
