import {
  deriveDeviceStatus,
  ONLINE_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
} from "./device-status";

const NOW = new Date("2026-08-23T12:00:00.000Z");

describe("deriveDeviceStatus", () => {
  test("offline cuando nunca reportó", () => {
    expect(deriveDeviceStatus(null, NOW)).toBe("offline");
  });

  test("online dentro del umbral online", () => {
    const lastSeenAt = new Date(NOW.getTime() - ONLINE_THRESHOLD_MS);
    expect(deriveDeviceStatus(lastSeenAt, NOW)).toBe("online");
  });

  test("stale justo pasado el umbral online", () => {
    const lastSeenAt = new Date(NOW.getTime() - ONLINE_THRESHOLD_MS - 1);
    expect(deriveDeviceStatus(lastSeenAt, NOW)).toBe("stale");
  });

  test("stale dentro del umbral stale", () => {
    const lastSeenAt = new Date(NOW.getTime() - STALE_THRESHOLD_MS);
    expect(deriveDeviceStatus(lastSeenAt, NOW)).toBe("stale");
  });

  test("offline pasado el umbral stale", () => {
    const lastSeenAt = new Date(NOW.getTime() - STALE_THRESHOLD_MS - 1);
    expect(deriveDeviceStatus(lastSeenAt, NOW)).toBe("offline");
  });
});
