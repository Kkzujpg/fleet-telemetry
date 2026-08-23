import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { parseLoginBody, parseRefreshTokenBody } from './auth.dto';
import { parseCookieHeader } from './cookie.util';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Minimal shapes for what we need from express - avoids depending on
// @types/express (not installed), matching the rest of this codebase.
interface CookieCapableResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options: Record<string, unknown>): void;
}

interface IncomingRequest {
  ip?: string;
}

interface AuthenticatedRequest {
  user: { sub: string; role: string };
}

function refreshCookieOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/auth',
  };
}

function setRefreshCookie(res: CookieCapableResponse, value: string): void {
  res.cookie(REFRESH_COOKIE_NAME, value, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: CookieCapableResponse): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: IncomingRequest,
    @Res({ passthrough: true }) res: CookieCapableResponse,
  ) {
    const { email, password } = parseLoginBody(body);
    const result = await this.auth.login(email, password, req.ip ?? 'unknown');
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: CookieCapableResponse,
  ) {
    const cookies = parseCookieHeader(cookieHeader);
    const result = await this.auth.refresh(cookies[REFRESH_COOKIE_NAME]);
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: CookieCapableResponse,
  ) {
    const cookies = parseCookieHeader(cookieHeader);
    await this.auth.logout(cookies[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.me(req.user.sub);
  }

  // Mobile has no browser cookie jar to carry an httpOnly refresh cookie, so
  // this family transports the refresh token in the JSON body instead. It
  // deliberately never reads the `refreshToken` cookie the web flow above
  // sets - if it did, a client-controlled signal (a header, a path) would let
  // an XSS on the web app call it and read out a cookie it can't access
  // directly, defeating httpOnly. Same underlying AuthService, different
  // transport only.
  @Public()
  @Post('mobile/login')
  @HttpCode(HttpStatus.OK)
  async mobileLogin(@Body() body: unknown, @Req() req: IncomingRequest) {
    const { email, password } = parseLoginBody(body);
    return this.auth.login(email, password, req.ip ?? 'unknown');
  }

  @Public()
  @Post('mobile/refresh')
  @HttpCode(HttpStatus.OK)
  async mobileRefresh(@Body() body: unknown) {
    const { refreshToken } = parseRefreshTokenBody(body);
    return this.auth.refresh(refreshToken);
  }

  @Post('mobile/logout')
  @HttpCode(HttpStatus.OK)
  async mobileLogout(@Body() body: unknown) {
    const { refreshToken } = parseRefreshTokenBody(body);
    await this.auth.logout(refreshToken);
    return { ok: true };
  }
}
