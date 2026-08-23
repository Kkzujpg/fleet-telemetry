import { gaussianNoise } from "./gaussian-noise";

describe("gaussianNoise", () => {
  test("applies the Box-Muller transform to an injected random source", () => {
    const u = 0.5;
    const v = 0.25;
    const sequence = [u, v];
    const random = () => sequence.shift()!;

    const result = gaussianNoise(0, 1, random);

    const expectedZ = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    expect(result).toBeCloseTo(expectedZ, 10);
  });

  test("scales by stdDev and shifts by mean", () => {
    const sequence = [0.5, 0.25, 0.5, 0.25];
    const random = () => sequence.shift()!;

    const unit = gaussianNoise(0, 1, random);
    sequence.push(0.5, 0.25);
    const scaled = gaussianNoise(10, 3, random);

    expect(scaled).toBeCloseTo(10 + unit * 3, 10);
  });

  test("never calls random() with a 0 that would break log(0)", () => {
    const sequence = [0, 0, 0.5, 0.5];
    const random = () => sequence.shift()!;

    const result = gaussianNoise(0, 1, random);

    expect(Number.isFinite(result)).toBe(true);
  });
});
