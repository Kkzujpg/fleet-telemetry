import { LatLng, positionAtDistance } from '../../../shared/route';
import { gaussianNoise, RandomSource } from '../../../shared/gaussian-noise';
import { ConsumptionModelParams, consumptionLitersPerHour, fuelLevelPct } from '../../../shared/fuel';

export interface VehicleSimState {
  deviceId: string;
  publicId: string;
  tankCapacityL: number;
  route: LatLng[];
  progressKm: number;
  fuelLiters: number;
  odometerKm: number;
}

export interface VehicleSimReading {
  lat: number;
  lng: number;
  speedKph: number;
  fuelLevelPct: number;
  fuelLiters: number;
  engineTempC: number;
  odometerKm: number;
}

export interface VehicleSimTickResult {
  state: VehicleSimState;
  reading: VehicleSimReading;
}

export interface TickParams {
  deltaSimHours: number;
  randomSource?: RandomSource;
  /** Defaults to CONSUMPTION_PARAMS (realistic rate, used by history seeding). SimService overrides it for a demo-speed drain. */
  consumptionParams?: ConsumptionModelParams;
}

const MEAN_SPEED_KPH = 45;
const SPEED_NOISE_STD_KPH = 12;
const MIN_SPEED_KPH = 5;
const MAX_SPEED_KPH = 90;

const CONSUMPTION_PARAMS = { baseRateLph: 8, refSpeedKph: 60, noiseStdDevLph: 0.6 };

const ENGINE_TEMP_BASE_C = 88;
const ENGINE_TEMP_NOISE_STD_C = 2;
const MIN_ENGINE_TEMP_C = 70;
const MAX_ENGINE_TEMP_C = 110;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Advances one vehicle by `deltaSimHours` of simulated time. Pure given `randomSource`. */
export function tickVehicle(
  state: VehicleSimState,
  { deltaSimHours, randomSource = Math.random, consumptionParams = CONSUMPTION_PARAMS }: TickParams,
): VehicleSimTickResult {
  // Already empty at the start of this tick: stay parked instead of moving
  // on nothing. Running dry mid-tick still lets that tick's distance through
  // (settles on the next tick) - splitting a tick at the exact empty point
  // isn't worth the complexity for a simulator.
  const outOfFuel = state.fuelLiters <= 0;

  const speedKph = outOfFuel
    ? 0
    : clamp(
        MEAN_SPEED_KPH + gaussianNoise(0, SPEED_NOISE_STD_KPH, randomSource),
        MIN_SPEED_KPH,
        MAX_SPEED_KPH,
      );
  const distanceKm = speedKph * deltaSimHours;

  const consumptionNoise = gaussianNoise(0, consumptionParams.noiseStdDevLph, randomSource);
  const litersPerHour = consumptionLitersPerHour(speedKph, consumptionParams, consumptionNoise);
  const fuelLiters = Math.max(0, state.fuelLiters - litersPerHour * deltaSimHours);

  const progressKm = state.progressKm + distanceKm;
  const position = positionAtDistance(state.route, progressKm);
  const odometerKm = state.odometerKm + distanceKm;

  const engineTempC = clamp(
    ENGINE_TEMP_BASE_C + gaussianNoise(0, ENGINE_TEMP_NOISE_STD_C, randomSource),
    MIN_ENGINE_TEMP_C,
    MAX_ENGINE_TEMP_C,
  );

  const nextState: VehicleSimState = { ...state, progressKm, fuelLiters, odometerKm };

  return {
    state: nextState,
    reading: {
      lat: position.lat,
      lng: position.lng,
      speedKph,
      fuelLevelPct: fuelLevelPct(fuelLiters, state.tankCapacityL),
      fuelLiters,
      engineTempC,
      odometerKm,
    },
  };
}
