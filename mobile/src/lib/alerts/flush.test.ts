import { flushAlertAcks } from './flush';

type Handler = (action: { id: string; kind: string; payload: unknown; enqueuedAt: string }) => Promise<boolean>;

const mockFlushQueue = jest.fn<Promise<void>, [Handler]>();
jest.mock('../offline/offline', () => ({ flushQueue: (handler: Handler) => mockFlushQueue(handler) }));

beforeEach(() => {
  mockFlushQueue.mockReset();
});

function action(kind: string, payload: unknown) {
  return { id: 'a1', kind, payload, enqueuedAt: '2026-08-23T12:00:00.000Z' };
}

describe('flushAlertAcks', () => {
  test('acks the alert and reports success so the outbox entry is removed', async () => {
    const apiFetch = jest.fn().mockResolvedValue(undefined);
    mockFlushQueue.mockImplementation(async (handler) => {
      const ok = await handler(action('alert:ack', { alertId: 'a1', idempotencyKey: 'k1' }));
      expect(ok).toBe(true);
    });

    await flushAlertAcks(apiFetch);

    expect(apiFetch).toHaveBeenCalledWith(
      '/alerts/a1/ack',
      expect.objectContaining({ method: 'POST', headers: { 'idempotency-key': 'k1' } }),
    );
  });

  test('leaves the entry queued when the ack request fails', async () => {
    const apiFetch = jest.fn().mockRejectedValue(new Error('still offline'));
    mockFlushQueue.mockImplementation(async (handler) => {
      const ok = await handler(action('alert:ack', { alertId: 'a1', idempotencyKey: 'k1' }));
      expect(ok).toBe(false);
    });

    await flushAlertAcks(apiFetch);
  });

  test('drops (does not retry) an action with an unknown kind or malformed payload', async () => {
    const apiFetch = jest.fn();
    mockFlushQueue.mockImplementation(async (handler) => {
      expect(await handler(action('something:else', { foo: 'bar' }))).toBe(true);
      expect(await handler(action('alert:ack', { alertId: 'only-this' }))).toBe(true);
    });

    await flushAlertAcks(apiFetch);

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
