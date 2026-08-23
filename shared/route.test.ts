import { LatLng, positionAtDistance, routeLengthKm } from "./route";

// A small square loop, roughly 111km per degree at the equator, so each
// side is close to 11.1km - easy numbers to reason about.
const square: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0.1, lng: 0 },
  { lat: 0.1, lng: 0.1 },
  { lat: 0, lng: 0.1 },
];

describe("routeLengthKm", () => {
  test("sums the closed loop, including the segment back to the start", () => {
    const length = routeLengthKm(square);
    expect(length).toBeGreaterThan(40);
    expect(length).toBeLessThan(46);
  });

  test("a single point has zero length", () => {
    expect(routeLengthKm([{ lat: 4, lng: -74 }])).toBe(0);
  });
});

describe("positionAtDistance", () => {
  test("distance 0 returns the first waypoint", () => {
    expect(positionAtDistance(square, 0)).toEqual(square[0]);
  });

  test("interpolates partway along the first segment", () => {
    // routeLengthKm of a 2-point array counts the segment both ways (a->b->a),
    // so half of that is the true one-way distance from square[0] to square[1].
    const segmentKm = routeLengthKm([square[0], square[1]]) / 2;
    const pos = positionAtDistance(square, segmentKm / 2);
    expect(pos.lat).toBeCloseTo(0.05, 2);
    expect(pos.lng).toBeCloseTo(0, 5);
  });

  test("wraps around past the total route length", () => {
    const total = routeLengthKm(square);
    const wrapped = positionAtDistance(square, total + 1);
    const fromStart = positionAtDistance(square, 1);
    expect(wrapped.lat).toBeCloseTo(fromStart.lat, 6);
    expect(wrapped.lng).toBeCloseTo(fromStart.lng, 6);
  });

  test("handles negative distance by wrapping backwards", () => {
    const total = routeLengthKm(square);
    const negative = positionAtDistance(square, -1);
    const equivalent = positionAtDistance(square, total - 1);
    expect(negative.lat).toBeCloseTo(equivalent.lat, 6);
    expect(negative.lng).toBeCloseTo(equivalent.lng, 6);
  });
});
