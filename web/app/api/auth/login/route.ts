import { NextRequest, NextResponse } from "next/server";
import {
  BACKEND_HTTP_URL,
  REFRESH_COOKIE_NAME,
  extractCookieValue,
  refreshCookieOptions,
  roleCookieOptions,
} from "../_cookies";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const backendRes = await fetch(`${BACKEND_HTTP_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await backendRes.json().catch(() => null);
  if (!backendRes.ok) {
    return NextResponse.json(payload ?? { message: "login failed" }, { status: backendRes.status });
  }

  const res = NextResponse.json({ accessToken: payload.accessToken, user: payload.user });

  const refreshToken = extractCookieValue(backendRes.headers.get("set-cookie"), REFRESH_COOKIE_NAME);
  if (refreshToken) {
    res.cookies.set(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  }
  res.cookies.set("role", payload.user.role, roleCookieOptions());

  return res;
}
