/**
 * Fusiona intentos de refresh concurrentes en una sola llamada en curso. El
 * refresh token del backend es de un solo uso y rota en cada llamada - dos
 * llamadores compitiendo con el mismo token stale dispararían la detección
 * de reuso y revocarían toda la sesión (ver
 * backend/src/auth/refresh-token.service.ts). Nunca dejar más de un refresh
 * en curso a la vez.
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
