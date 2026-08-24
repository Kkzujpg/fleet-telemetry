import { LatLng, positionAtDistance, routeLengthKm } from "./route";

// Un circuito cuadrado pequeño, ~111km por grado en el ecuador, así que cada
// lado ronda 11.1km - números fáciles de razonar.
const square: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0.1, lng: 0 },
  { lat: 0.1, lng: 0.1 },
  { lat: 0, lng: 0.1 },
];

describe("routeLengthKm", () => {
  test("suma el circuito cerrado, incluyendo el segmento de vuelta al inicio", () => {
    const length = routeLengthKm(square);
    expect(length).toBeGreaterThan(40);
    expect(length).toBeLessThan(46);
  });

  test("un solo punto tiene longitud cero", () => {
    expect(routeLengthKm([{ lat: 4, lng: -74 }])).toBe(0);
  });
});

describe("positionAtDistance", () => {
  test("distancia 0 devuelve el primer waypoint", () => {
    expect(positionAtDistance(square, 0)).toEqual(square[0]);
  });

  test("interpola a mitad de camino en el primer segmento", () => {
    // routeLengthKm de un array de 2 puntos cuenta el segmento en ambos
    // sentidos (a->b->a), así que la mitad es la distancia real de ida
    // entre square[0] y square[1].
    const segmentKm = routeLengthKm([square[0], square[1]]) / 2;
    const pos = positionAtDistance(square, segmentKm / 2);
    expect(pos.lat).toBeCloseTo(0.05, 2);
    expect(pos.lng).toBeCloseTo(0, 5);
  });

  test("da la vuelta al superar el largo total de la ruta", () => {
    const total = routeLengthKm(square);
    const wrapped = positionAtDistance(square, total + 1);
    const fromStart = positionAtDistance(square, 1);
    expect(wrapped.lat).toBeCloseTo(fromStart.lat, 6);
    expect(wrapped.lng).toBeCloseTo(fromStart.lng, 6);
  });

  test("maneja distancia negativa dando la vuelta hacia atrás", () => {
    const total = routeLengthKm(square);
    const negative = positionAtDistance(square, -1);
    const equivalent = positionAtDistance(square, total - 1);
    expect(negative.lat).toBeCloseTo(equivalent.lat, 6);
    expect(negative.lng).toBeCloseTo(equivalent.lng, 6);
  });
});
