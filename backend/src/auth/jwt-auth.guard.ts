import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessTokenService } from './access-token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokens: AccessTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers?.authorization;

    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);

    try {
      request.user = this.accessTokens.verify(token);
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }

    return true;
  }
}
