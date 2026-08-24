/**
 * Coalesces concurrent refresh attempts into one in-flight call. The backend
 * refresh token is single-use and rotates on every call - two callers racing
 * with the same stale token would trip reuse detection and revoke the whole
 * session (see backend/src/auth/refresh-token.service.ts). Never let more
 * than one refresh be in flight at a time.
 */
export function createRefreshQueue(refresh: () => Promise<string>) {
  let inFlight: Promise<string> | null = null;

  return function getFreshAccessToken(): Promise<string> {
    if (!inFlight) {
      inFlight = refresh().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
