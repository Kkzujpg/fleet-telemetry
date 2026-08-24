export const REFRESH_COOKIE_NAME = "refreshToken";
// Must be site-wide: (app)/layout.tsx and /alerts/page.tsx read it (and the
// role hint cookie) as Server Components on every page path, not just under
// /api/auth. httpOnly still keeps the value itself unreadable to client JS.
export const REFRESH_COOKIE_PATH = "/";
export const REFRESH_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export const BACKEND_HTTP_URL = process.env.BACKEND_HTTP_URL ?? "http://localhost:3001/api/v1";

/** Pulls a cookie's value out of a raw Set-Cookie header sent by the backend. */
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
