import { NotFoundException } from '@nestjs/common';
import { SimService } from '../../src/sim/sim.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const DEVICES = [
  { id: 'uuid-1', publicId: 'DEV-0001-AA11', plate: 'ABC123', tankCapacityL: 60, status: 'ACTIVE', lastSeenAt: null, createdAt: new Date() },
  { id: 'uuid-2', publicId: 'DEV-0002-BB22', plate: 'DEF456', tankCapacityL: 50, status: 'ACTIVE', lastSeenAt: null, createdAt: new Date() },
];

function buildService(): { service: SimService; findMany: jest.Mock; findFirst: jest.Mock } {
  const findMany = jest.fn().mockResolvedValue(DEVICES);
  const findFirst = jest.fn().mockResolvedValue(null);
  const prisma = {
    device: { findMany },
    telemetryReading: { findFirst },
  } as unknown as PrismaService;
  return { service: new SimService(prisma), findMany, findFirst };
}

describe('SimService', () => {
  const originalFetch = global.fetch;
  const originalPort = process.env.PORT;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.PORT = '3001';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    process.env.PORT = originalPort;
  });

  test('start loads devices from the db and reports them as tracked', async () => {
    const { service, findMany } = buildService();

    const status = await service.start();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(status).toEqual({ running: true, vehicleCount: 2 });
  });

  test('start is idempotent while already running', async () => {
    const { service, findMany } = buildService();

    await service.start();
    await service.start();

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  test('stop clears the tracked vehicles', async () => {
    const { service } = buildService();
    await service.start();

    const status = service.stop();

    expect(status).toEqual({ running: false, vehicleCount: 0 });
  });

  test('drain forces a tracked device to low fuel', async () => {
    const { service } = buildService();
    await service.start();

    service.drain('DEV-0001-AA11');

    // fetch solo se llama en cada tick, así que avanzamos un tick e inspeccionamos el body.
    await jest.advanceTimersByTimeAsync(3000);

    const call = (global.fetch as jest.Mock).mock.calls.find(
      ([, init]) => JSON.parse(init.body as string).devicePublicId === 'DEV-0001-AA11',
    );
    const body = JSON.parse(call[1].body as string);
    expect(body.fuelLevelPct).toBeLessThan(10);
  });

  test('drain throws for a device the simulator is not tracking', async () => {
    const { service } = buildService();
    await service.start();

    expect(() => service.drain('DEV-9999-ZZ99')).toThrow(NotFoundException);
  });

  test('drain throws when the simulator is not running', () => {
    const { service } = buildService();

    expect(() => service.drain('DEV-0001-AA11')).toThrow(NotFoundException);
  });

  test('each tick posts telemetry for every tracked device to the real HTTP endpoint', async () => {
    const { service } = buildService();
    await service.start();

    await jest.advanceTimersByTimeAsync(3000);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/telemetry',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('refills the tank on start but continues odometer from the device\'s last known reading', async () => {
    const { service, findFirst } = buildService();
    findFirst.mockResolvedValue({ fuelLiters: 12.5, odometerKm: 4321 });

    await service.start();
    await jest.advanceTimersByTimeAsync(3000);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    // Cada start() es una corrida nueva, no una reanudación - el combustible
    // debe arrancar de un tanque lleno de 60L, no continuar donde dejó la
    // corrida anterior (12.5L), así que el consumo de un tick igual lo deja
    // bastante por encima del viejo valor continuado.
    expect(body.fuelLiters).toBeGreaterThan(30);
    expect(body.fuelLiters).toBeLessThanOrEqual(60);
    // El kilometraje sí se mantiene entre reinicios.
    expect(body.odometerKm).toBeGreaterThan(4321);
  });

  test('drains a full tank to a critical autonomy level within a few minutes of wall-clock time', async () => {
    const { service } = buildService();
    await service.start();

    // 200 ticks * 3s = 10 minutos de tiempo real (fake timers de jest).
    for (let i = 0; i < 200; i++) {
      await jest.advanceTimersByTimeAsync(3000);
    }

    const calls = (global.fetch as jest.Mock).mock.calls;
    const lastForDeviceOne = [...calls]
      .reverse()
      .find(([, init]) => JSON.parse(init.body as string).devicePublicId === 'DEV-0001-AA11');
    const body = JSON.parse(lastForDeviceOne[1].body as string);

    // Arrancó con un tanque lleno de 60L; la tasa de consumo de demo debe
    // haberlo quemado hasta cerca de vacío bien dentro de la ventana de 10
    // minutos, no dejarlo apenas mellado como haría la tasa realista del seed.
    expect(body.fuelLiters).toBeLessThan(10);
  });

  test('stamps each reading with simulated time, not wall-clock real time, so the fuel regression sees plausible deltas', async () => {
    const { service } = buildService();
    await service.start();

    await jest.advanceTimersByTimeAsync(3000);
    const first = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);

    await jest.advanceTimersByTimeAsync(3000);
    const second = JSON.parse((global.fetch as jest.Mock).mock.calls[2][1].body as string);

    const deltaMs = new Date(second.recordedAt).getTime() - new Date(first.recordedAt).getTime();
    // 2 minutos simulados por tick, sin importar el intervalo real de 3 segundos entre ticks.
    expect(deltaMs).toBe(2 * 60_000);
  });

  test('never stamps a reading more than the lead cap ahead of wall-clock time, even after many ticks', async () => {
    const { service } = buildService();
    await service.start();

    // 20 ticks de 2 minutos simulados cada uno estarían 40 minutos adelantados
    // al tiempo real si no tuvieran tope - el tiempo real (fake) acá solo avanza 60s.
    for (let i = 0; i < 20; i++) {
      await jest.advanceTimersByTimeAsync(3000);
    }

    const now = Date.now();
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, init] of calls) {
      const body = JSON.parse(init.body as string);
      expect(new Date(body.recordedAt).getTime()).toBeLessThanOrEqual(now + 4 * 60_000);
    }
  });
});
