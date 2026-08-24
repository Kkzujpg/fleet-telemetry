export type RandomSource = () => number;

/**
 * Transformada de Box-Muller. `random` usa Math.random por defecto pero es
 * inyectable para que los llamadores (y los tests) puedan obtener ruido
 * determinístico.
 */
export function gaussianNoise(
  mean: number,
  stdDev: number,
  random: RandomSource = Math.random,
): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();

  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * stdDev;
}
