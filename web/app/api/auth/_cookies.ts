export const REFRESH_COOKIE_NAME = "refreshToken";
// Debe ser de todo el sitio: (app)/layout.tsx y /alerts/page.tsx la leen (y
// también la cookie de pista de rol) como Server Components en cualquier
// ruta de página, no solo bajo /api/auth. httpOnly igual mantiene el valor
// en sí ilegible para JS del cliente.
export const REFRESH_COOKIE_PATH = "/";
export const REFRESH_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export const BACKEND_HTTP_URL = process.env.BACKEND_HTTP_URL ?? "http://localhost:3001/api/v1";

/** Extrae el valor de una cookie de un header Set-Cookie crudo enviado por el backend. */
export function extractCookieValue(setCookieHeader: string | null, name: string): string | null {
  if (!setCookieHeader) {
    return null;
  }
  const match = new RegExp(`${name}=([^;]+)`).exec(setCookieHeader);
  return match ? decodeURIComponent(match[1]) : null;
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SEC,
  };
}

export function roleCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_SEC,
  };
}
