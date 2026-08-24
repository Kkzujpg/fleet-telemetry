import { LatLng } from '../../../shared/route';

// Circuitos aproximados en varias ciudades colombianas, solo para darle al
// simulador algo plausible por donde recorrer - no son datos de calles
// relevados.
export const COLOMBIA_ROUTES: LatLng[][] = [
  // Bogotá - Norte: Autopista Norte <-> Av. Boyacá, entre Calle 100 y Calle 170
  [
    { lat: 4.686, lng: -74.055 },
    { lat: 4.744, lng: -74.043 },
    { lat: 4.744, lng: -74.083 },
    { lat: 4.686, lng: -74.083 },
  ],
  // Bogotá - Centro: Av. NQS <-> Av. Caracas, entre Calle 6 y Calle 26
  [
    { lat: 4.658, lng: -74.093 },
    { lat: 4.598, lng: -74.093 },
    { lat: 4.598, lng: -74.075 },
    { lat: 4.658, lng: -74.075 },
  ],
  // Bogotá - Occidente: Av. Ciudad de Cali <-> Av. Boyacá, entre Calle 13 y Calle 80
  [
    { lat: 4.699, lng: -74.126 },
    { lat: 4.635, lng: -74.126 },
    { lat: 4.635, lng: -74.083 },
    { lat: 4.699, lng: -74.083 },
  ],
  // Medellín - El Poblado <-> Laureles, cruzando el Río Medellín
  [
    { lat: 6.209, lng: -75.567 },
    { lat: 6.244, lng: -75.567 },
    { lat: 6.244, lng: -75.595 },
    { lat: 6.209, lng: -75.595 },
  ],
  // Cali - Sur <-> Centro, por la Autopista Simón Bolívar
  [
    { lat: 3.377, lng: -76.532 },
    { lat: 3.451, lng: -76.532 },
    { lat: 3.451, lng: -76.522 },
    { lat: 3.377, lng: -76.522 },
  ],
  // Cartagena - Bocagrande <-> Centro Histórico
  [
    { lat: 10.391, lng: -75.479 },
    { lat: 10.424, lng: -75.479 },
    { lat: 10.424, lng: -75.552 },
    { lat: 10.391, lng: -75.552 },
  ],
  // Barranquilla - Norte <-> Centro, por la Vía 40
  [
    { lat: 10.968, lng: -74.781 },
    { lat: 11.005, lng: -74.781 },
    { lat: 11.005, lng: -74.805 },
    { lat: 10.968, lng: -74.805 },
  ],
  // Bucaramanga - Cabecera <-> Centro
  [
    { lat: 7.119, lng: -73.122 },
    { lat: 7.145, lng: -73.122 },
    { lat: 7.145, lng: -73.105 },
    { lat: 7.119, lng: -73.105 },
  ],
];

export function routeForIndex(index: number): LatLng[] {
  return COLOMBIA_ROUTES[index % COLOMBIA_ROUTES.length];
}
