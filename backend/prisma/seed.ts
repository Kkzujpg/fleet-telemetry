import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../shared/password';
import { fuelLevelPct } from '../../shared/fuel';
import { routeForIndex } from '../src/sim/routes';
import { tickVehicle, VehicleSimState } from '../src/sim/vehicle-sim-engine';

const prisma = new PrismaClient();

const USERS: { email: string; password: string; role: 'ADMIN' | 'OPERATOR' | 'VIEWER' }[] = [
  { email: 'admin@fleet.demo', password: 'Admin123!', role: 'ADMIN' },
  { email: 'operator@fleet.demo', password: 'Operator123!', role: 'OPERATOR' },
  { email: 'viewer@fleet.demo', password: 'Viewer123!', role: 'VIEWER' },
];

const VEHICLES: { plate: string; publicIdSuffix: string; tankCapacityL: number }[] = [
  { plate: 'ABC123', publicIdSuffix: 'XC54', tankCapacityL: 55 },
  { plate: 'DEF456', publicIdSuffix: 'QM12', tankCapacityL: 60 },
  { plate: 'GHI789', publicIdSuffix: 'LR88', tankCapacityL: 45 },
  { plate: 'JKL012', publicIdSuffix: 'TN03', tankCapacityL: 65 },
  { plate: 'MNO345', publicIdSuffix: 'BV77', tankCapacityL: 50 },
  { plate: 'PQR678', publicIdSuffix: 'KP21', tankCapacityL: 55 },
  { plate: 'STU901', publicIdSuffix: 'WD65', tankCapacityL: 70 },
  { plate: 'VWX234', publicIdSuffix: 'HS40', tankCapacityL: 60 },
];

const READING_INTERVAL_MIN = 5;
const HISTORY_HOURS = 6;
const READINGS_PER_DEVICE = (HISTORY_HOURS * 60) / READING_INTERVAL_MIN;
const REFUEL_AT_READING_INDEX = 40;
const REFUEL_LITERS = 30;

function publicIdFor(index: number, suffix: string): string {
  return `DEV-${String(index + 1).padStart(4, '0')}-${suffix}`;
}

async function seedUsers(): Promise<void> {
  for (const user of USERS) {
    const passwordHash = await hashPassword(user.password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role },
      create: { email: user.email, passwordHash, role: user.role },
    });
    console.log(`  user ${user.email} (${user.role})`);
  }
}

async function seedDeviceHistory(index: number, vehicle: (typeof VEHICLES)[number]): Promise<void> {
  const device = await prisma.device.create({
    data: {
      publicId: publicIdFor(index, vehicle.publicIdSuffix),
      plate: vehicle.plate,
      tankCapacityL: vehicle.tankCapacityL,
      status: 'ACTIVE',
    },
  });

  let state: VehicleSimState = {
    deviceId: device.id,
    publicId: device.publicId,
    tankCapacityL: vehicle.tankCapacityL,
    route: routeForIndex(index),
    progressKm: 0,
    fuelLiters: vehicle.tankCapacityL * 0.95,
    odometerKm: 10_000 + index * 500,
  };

  const historyStartMs = Date.now() - HISTORY_HOURS * 60 * 60 * 1000;
  const deltaSimHours = READING_INTERVAL_MIN / 60;

  const rows: {
    deviceId: string;
    recordedAt: Date;
    lat: number;
    lng: number;
    speedKph: number;
    fuelLevelPct: number;
    fuelLiters: number;
    engineTempC: number;
    odometerKm: number;
  }[] = [];

  for (let r = 0; r < READINGS_PER_DEVICE; r++) {
    const { state: next, reading } = tickVehicle(state, { deltaSimHours });
    state = next;

    // Al menos un repostaje dentro de la ventana de historial, para que
    // detectRefuel() tenga algo real donde cortar y la regresión no sea un
    // declive plano.
    if (r === REFUEL_AT_READING_INDEX) {
      state.fuelLiters = Math.min(vehicle.tankCapacityL, state.fuelLiters + REFUEL_LITERS);
    }

    rows.push({
      deviceId: device.id,
      recordedAt: new Date(historyStartMs + r * READING_INTERVAL_MIN * 60_000),
      lat: reading.lat,
      lng: reading.lng,
      speedKph: reading.speedKph,
      fuelLevelPct: fuelLevelPct(state.fuelLiters, vehicle.tankCapacityL),
      fuelLiters: state.fuelLiters,
      engineTempC: reading.engineTempC,
      odometerKm: reading.odometerKm,
    });
  }

  await prisma.telemetryReading.createMany({ data: rows });
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: rows[rows.length - 1].recordedAt },
  });

  console.log(
    `  ${device.publicId} (${device.plate}): ${rows.length} lecturas, repostaje en la #${REFUEL_AT_READING_INDEX + 1}`,
  );
}

async function main(): Promise<void> {
  console.log('Usuarios:');
  await seedUsers();

  console.log('Vehículos + histórico (6h, ruido gaussiano en combustible):');
  await prisma.alert.deleteMany();
  await prisma.telemetryReading.deleteMany();
  await prisma.device.deleteMany();

  for (let i = 0; i < VEHICLES.length; i++) {
    await seedDeviceHistory(i, VEHICLES[i]);
  }

  console.log('Seed listo.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
