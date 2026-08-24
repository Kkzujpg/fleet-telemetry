import { LatLng } from '../../../shared/route';
import { VehicleSimState, tickVehicle } from '../../src/sim/vehicle-sim-engine';

const ROUTE: LatLng[] = [
  { lat: 4.6, lng: -74.1 },
  { lat: 4.7, lng: -74.1 },
  { lat: 4.7, lng: -74.0 },
  { lat: 4.6, lng: -74.0 },
];

function baseState(overrides: Partial<VehicleSimState> = {}): VehicleSimState {
  return {
    deviceId: 'device-1',
    publicId: 'DEV-1234-XC54',
    tankCapacityL: 60,
    route: ROUTE,
    progressKm: 0,
    fuelLiters: 30,
    odometerKm: 500,
    ...overrides,
  };
}

// Una fuente aleatoria que siempre devuelve 0.5: gaussianNoise(mean, std, r)
// con u=v=0.5 colapsa a mean + std * sqrt(-2*ln(0.5))*cos(pi) = mean - std*1.1774.
const NEUTRAL_RANDOM = () => 0.5;

describe('tickVehicle', () => {
  test('moves the vehicle forward along the route and accumulates the odometer', () => {
    const state = baseState();

    const { state: next } = tickVehicle(state, { deltaSimHours: 0.5, randomSource: NEUTRAL_RANDOM });

    expect(next.progressKm).toBeGreaterThan(0);
    expect(next.odometerKm).toBeCloseTo(state.odometerKm + next.progressKm, 6);
  });

  test('consumes fuel proportional to speed and never lets it go negative', () => {
    const state = baseState({ fuelLiters: 0.01 });

    const { state: next, reading } = tickVehicle(state, { deltaSimHours: 5, randomSource: NEUTRAL_RANDOM });

    expect(next.fuelLiters).toBeGreaterThanOrEqual(0);
    expect(reading.fuelLiters).toBe(next.fuelLiters);
  });

  test('reading.fuelLevelPct reflects fuelLiters against tankCapacityL', () => {
    const state = baseState({ fuelLiters: 30, tankCapacityL: 60 });

    const { reading } = tickVehicle(state, { deltaSimHours: 0, randomSource: NEUTRAL_RANDOM });

    expect(reading.fuelLevelPct).toBeCloseTo(50, 5);
  });

  test('is deterministic given the same injected random source', () => {
    const state = baseState();

    const a = tickVehicle(state, { deltaSimHours: 0.25, randomSource: NEUTRAL_RANDOM });
    const b = tickVehicle(state, { deltaSimHours: 0.25, randomSource: NEUTRAL_RANDOM });

    expect(a.reading).toEqual(b.reading);
    expect(a.state).toEqual(b.state);
  });

  test('zero elapsed time leaves position and odometer unchanged', () => {
    const state = baseState();

    const { state: next } = tickVehicle(state, { deltaSimHours: 0, randomSource: NEUTRAL_RANDOM });

    expect(next.progressKm).toBe(state.progressKm);
    expect(next.odometerKm).toBe(state.odometerKm);
  });

  test('a vehicle that already ran out of fuel stays parked instead of continuing to drive', () => {
    const state = baseState({ fuelLiters: 0 });

    const { state: next, reading } = tickVehicle(state, { deltaSimHours: 0.5, randomSource: NEUTRAL_RANDOM });

    expect(reading.speedKph).toBe(0);
    expect(next.progressKm).toBe(state.progressKm);
    expect(next.odometerKm).toBe(state.odometerKm);
    expect(next.fuelLiters).toBe(0);
  });
});
