export interface VehiclePopupData {
  publicId: string;
  plate: string;
  speedKph: number;
  fuelLiters: number;
  connectivityStatus: "online" | "stale" | "offline";
}

const STATUS_LABEL: Record<VehiclePopupData["connectivityStatus"], string> = {
  online: "En línea",
  stale: "Señal débil",
  offline: "Sin señal",
};

/**
 * Construye el DOM del popup a mano (textContent, nunca innerHTML) para que
 * cada campo se muestre exactamente como llega - sin sorpresas de escapado,
 * ni riesgo de que un valor se interprete como markup. En particular
 * `publicId` se renderiza tal cual llega: este componente a propósito no
 * sabe enmascarar un id - eso ocurre en el servidor (MaskingInterceptor) o
 * no ocurre en absoluto.
 */
export function buildPopupContent(data: VehiclePopupData): HTMLElement {
  const container = document.createElement("div");

  const plateEl = document.createElement("div");
  plateEl.className = "vehicle-popup-plate";
  plateEl.textContent = data.plate;
  container.appendChild(plateEl);

  const rows: Array<[string, string]> = [
    ["Estado", STATUS_LABEL[data.connectivityStatus]],
    ["Velocidad", `${data.speedKph.toFixed(0)} km/h`],
    ["Combustible", `${data.fuelLiters.toFixed(1)} L`],
    ["ID", data.publicId],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "vehicle-popup-row";

    const labelEl = document.createElement("span");
    labelEl.className = "vehicle-popup-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "vehicle-popup-value";
    valueEl.textContent = value;

    row.append(labelEl, valueEl);
    container.appendChild(row);
  }

  return container;
}
