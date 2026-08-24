// Glifo de vehículo dibujado para el mapa de flota, reemplazando la capa de
// círculo plano. Es un elemento DOM (maplibregl.Marker), no una capa de
// símbolo rasterizada, para que la rotación de heading y el color de estado
// se puedan actualizar en cada frame de animación vía custom properties CSS
// baratas en vez de re-renderizar un ícono de canvas.
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

/** El markup SVG de arriba es estático y escrito acá, nunca construido desde datos del device - seguro de setear vía innerHTML una vez. */
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

/** Rumbo de brújula en grados (0 = norte, horario) del punto a al punto b. */
export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const deltaLambda = toRad(b.lng - a.lng);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Por debajo de esto, dos puntos están tan cerca que un bearing calculado es ruido GPS, no movimiento real. */
export const HEADING_MIN_DELTA_DEG = 0.00002;

export function hasMoved(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) > HEADING_MIN_DELTA_DEG || Math.abs(a.lng - b.lng) > HEADING_MIN_DELTA_DEG;
}
