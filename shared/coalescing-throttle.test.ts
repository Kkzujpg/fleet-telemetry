import { createCoalescingThrottle } from "./coalescing-throttle";

describe("createCoalescingThrottle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("emits the first call for a key immediately", () => {
    const emit = jest.fn();
    const throttle = createCoalescingThrottle<string, number>(emit, 1000);

    throttle("device-1", 1);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("device-1", 1);
  });

  test("coalesces bursts within the window into a single trailing emit with the latest value", () => {
    const emit = jest.fn();
    const throttle = createCoalescingThrottle<string, number>(emit, 1000);

    throttle("device-1", 1);
    throttle("device-1", 2);
    throttle("device-1", 3);
    throttle("device-1", 4);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith("device-1", 1);

    jest.advanceTimersByTime(1000);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith("device-1", 4);
  });

  test("does not schedule a trailing emit when nothing arrives during the window", () => {
    const emit = jest.fn();
    const throttle = createCoalescingThrottle<string, number>(emit, 1000);

    throttle("device-1", 1);
    jest.advanceTimersByTime(1000);

    expect(emit).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);

    expect(emit).toHaveBeenCalledTimes(1);
  });

  test("a call after the window closes starts a fresh window and emits immediately", () => {
    const emit = jest.fn();
    const throttle = createCoalescingThrottle<string, number>(emit, 1000);

    throttle("device-1", 1);
    jest.advanceTimersByTime(1000);
    throttle("device-1", 2);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith("device-1", 2);
  });

  test("tracks separate windows per key", () => {
    const emit = jest.fn();
    const throttle = createCoalescingThrottle<string, number>(emit, 1000);

    throttle("device-1", 1);
    throttle("device-2", 10);

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith("device-1", 1);
    expect(emit).toHaveBeenCalledWith("device-2", 10);

    throttle("device-1", 2);
    throttle("device-2", 20);

    expect(emit).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(1000);

    expect(emit).toHaveBeenCalledTimes(4);
    expect(emit).toHaveBeenCalledWith("device-1", 2);
    expect(emit).toHaveBeenCalledWith("device-2", 20);
  });
});
