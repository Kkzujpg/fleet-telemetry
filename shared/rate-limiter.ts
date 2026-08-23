export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  recordFailure(key: string, now: Date): void {
    const timestamps = this.prune(key, now);
    timestamps.push(now.getTime());
    this.hits.set(key, timestamps);
  }

  isBlocked(key: string, now: Date): boolean {
    return this.prune(key, now).length >= this.maxAttempts;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private prune(key: string, now: Date): number[] {
    const cutoff = now.getTime() - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    this.hits.set(key, timestamps);
    return timestamps;
  }
}
