import { ackAlert } from './ack';

const mockEnqueue = jest.fn();
jest.mock('../offline/offline', () => ({ enqueue: (...args: unknown[]) => mockEnqueue(...args) }));

beforeEach(() => {
  mockEnqueue.mockClear();
});

describe('ackAlert', () => {
  test('acks directly and does not queue when the request succeeds', async () => {
    const apiFetch = jest.fn().mockResolvedValue({ id: 'alert-1' });

    const result = await ackAlert(apiFetch, 'alert-1');

    expect(result).toEqual({ queued: false });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith(
      '/alerts/alert-1/ack',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'idempotency-key': expect.any(String) }),
      }),
    );
  });

  test('queues the ack for later replay when the request fails', async () => {
    const apiFetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await ackAlert(apiFetch, 'alert-2');

    expect(result).toEqual({ queued: true });
    expect(mockEnqueue).toHaveBeenCalledWith({
      kind: 'alert:ack',
      payload: { alertId: 'alert-2', idempotencyKey: expect.any(String) },
    });
  });

  test('generates a fresh idempotency key per attempt', async () => {
    const apiFetch = jest.fn().mockRejectedValue(new Error('offline'));

    await ackAlert(apiFetch, 'alert-3');
    await ackAlert(apiFetch, 'alert-3');

    const [firstCall, secondCall] = mockEnqueue.mock.calls;
    expect(firstCall[0].payload.idempotencyKey).not.toBe(secondCall[0].payload.idempotencyKey);
  });
});
