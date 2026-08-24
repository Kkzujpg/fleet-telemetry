import { HealthService } from '../../src/health/health.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function fakePrisma(queryRaw: () => Promise<unknown>): PrismaService {
  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

describe('HealthService', () => {
  test('reports ok when the db ping succeeds', async () => {
    const service = new HealthService(fakePrisma(() => Promise.resolve([{ '?column?': 1 }])));

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.db).toBe('ok');
    expect(() => new Date(report.timestamp)).not.toThrow();
  });

  test('reports degraded when the db ping throws', async () => {
    const service = new HealthService(fakePrisma(() => Promise.reject(new Error('connection refused'))));

    const report = await service.check();

    expect(report.status).toBe('degraded');
    expect(report.db).toBe('error');
  });
});
