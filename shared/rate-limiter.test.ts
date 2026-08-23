import { SlidingWindowRateLimiter } from "./rate-limiter";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function limiter(): SlidingWindowRateLimiter {
  return new SlidingWindowRateLimiter(MAX_ATTEMPTS, WINDOW_MS);
}

describe("SlidingWindowRateLimiter", () => {
  test("allows attempts under the threshold", () => {
    const rl = limiter();
    const now = new Date();

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      rl.recordFailure("key-1", now);
    }

    expect(rl.isBlocked("key-1", now)).toBe(false);
  });

  test("blocks once the threshold is reached within the window", () => {
    const rl = limiter();
    const now = new Date();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      rl.recordFailure("key-1", now);
    }

    expect(rl.isBlocked("key-1", now)).toBe(true);
  });

  test("tracks keys independently", () => {
    const rl = limiter();
    const now = new Date();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      rl.recordFailure("key-1", now);
    }

    expect(rl.isBlocked("key-1", now)).toBe(true);
    expect(rl.isBlocked("key-2", now)).toBe(false);
  });

  test("unblocks once the failures age out of the window", () => {
    const rl = limiter();
    const start = new Date();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      rl.recordFailure("key-1", start);
    }
    expect(rl.isBlocked("key-1", start)).toBe(true);

    const afterWindow = new Date(start.getTime() + WINDOW_MS + 1);
    expect(rl.isBlocked("key-1", afterWindow)).toBe(false);
  });

  test("reset immediately clears a blocked key", () => {
    const rl = limiter();
    const now = new Date();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      rl.recordFailure("key-1", now);
    }
    rl.reset("key-1");

    expect(rl.isBlocked("key-1", now)).toBe(false);
  });
});
