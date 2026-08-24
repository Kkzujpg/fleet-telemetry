import { NextRequest, NextResponse } from "next/server";
import {
  BACKEND_HTTP_URL,
  REFRESH_COOKIE_NAME,
  extractCookieValue,
  refreshCookieOptions,
} from "../_cookies";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: "no session" }, { status: 401 });
  }

  const backendRes = await fetch(`${BACKEND_HTTP_URL}/auth/refresh`, {
    method: "POST",
    headers: { cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}` },
  });

  if (!backendRes.ok) {
    const res = NextResponse.json({ message: "session expired" }, { status: backendRes.status });
    res.cookies.delete(REFRESH_COOKIE_NAME);
    return res;
  }

  const payload = (await backendRes.json()) as { accessToken: string };
  const res = NextResponse.json({ accessToken: payload.accessToken });

  const rotated = extractCookieValue(backendRes.headers.get("set-cookie"), REFRESH_COOKIE_NAME);
  if (rotated) {
    res.cookies.set(REFRESH_COOKIE_NAME, rotated, refreshCookieOptions());
  }

  return res;
}
