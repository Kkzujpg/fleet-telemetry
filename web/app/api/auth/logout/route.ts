import { NextRequest, NextResponse } from "next/server";
import { BACKEND_HTTP_URL, REFRESH_COOKIE_NAME } from "../_cookies";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const authorization = req.headers.get("authorization");

  if (refreshToken) {
    // Best-effort: an expired access token means the backend 401s before it
    // can revoke the refresh token family, but the user is logged out
    // client-side regardless - the refresh token still expires on its own TTL.
    await fetch(`${BACKEND_HTTP_URL}/auth/logout`, {
      method: "POST",
      headers: {
        cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}`,
        ...(authorization ? { authorization } : {}),
      },
    }).catch(() => undefined);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(REFRESH_COOKIE_NAME);
  res.cookies.delete("role");
  return res;
}
