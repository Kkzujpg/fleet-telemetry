import { NextRequest, NextResponse } from "next/server";
import { BACKEND_HTTP_URL, REFRESH_COOKIE_NAME } from "../_cookies";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const authorization = req.headers.get("authorization");

  if (refreshToken) {
    // Best-effort: un access token expirado hace que el backend devuelva 401
    // antes de poder revocar la familia del refresh token, pero el usuario
    // igual queda deslogueado del lado del cliente - el refresh token de
    // todas formas expira por su propio TTL.
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
