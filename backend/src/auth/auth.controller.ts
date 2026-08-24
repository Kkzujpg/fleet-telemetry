import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { parseLoginBody, parseRefreshTokenBody } from './auth.dto';
import { parseCookieHeader } from './cookie.util';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Formas mínimas de lo que necesitamos de express - evita depender de
// @types/express (no instalado), en línea con el resto de este codebase.
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

  // Mobile no tiene cookie jar de navegador para llevar una refresh cookie
  // httpOnly, así que esta familia de endpoints transporta el refresh token
  // en el body JSON en su lugar. Deliberadamente nunca lee la cookie
  // `refreshToken` que el flujo web de arriba setea - si lo hiciera, una
  // señal controlada por el cliente (un header, un path) permitiría que un
  // XSS en la web app la invoque y lea una cookie a la que no puede acceder
  // directamente, anulando el httpOnly. Mismo AuthService subyacente, solo
  // cambia el transporte.
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
