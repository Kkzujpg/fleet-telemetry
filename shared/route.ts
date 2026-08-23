export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Length of the closed loop through `waypoints`, including the segment back to the start. */
export function routeLengthKm(waypoints: LatLng[]): number {
  if (waypoints.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    total += haversineKm(waypoints[i], waypoints[(i + 1) % waypoints.length]);
  }
  return total;
}

/**
 * Position after travelling `distanceKm` along the closed loop starting at
 * waypoints[0]. Distance wraps modulo the route length in both directions.
 */
export function positionAtDistance(waypoints: LatLng[], distanceKm: number): LatLng {
  if (waypoints.length === 1) return waypoints[0];

  const total = routeLengthKm(waypoints);
  if (total === 0) return waypoints[0];

  let remaining = ((distanceKm % total) + total) % total;

  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const segmentKm = haversineKm(a, b);

    if (remaining <= segmentKm) {
      const t = segmentKm === 0 ? 0 : remaining / segmentKm;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    remaining -= segmentKm;
  }

  return waypoints[0];
}
