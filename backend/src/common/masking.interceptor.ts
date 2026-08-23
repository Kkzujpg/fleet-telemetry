import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { maskDeviceId } from '../../../shared/mask';

const ADMIN_ROLE = 'ADMIN';

/**
 * Global response interceptor: masks every `publicId` field for any
 * non-ADMIN caller, walking arrays and nested objects so a new endpoint
 * can never forget to mask it by hand.
 *
 * Only covers the HTTP request/response cycle - see the WS gateway, which
 * emits over the socket directly and never runs through this pipeline.
 */
@Injectable()
export class MaskingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    if (request?.user?.role === ADMIN_ROLE) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => maskDeep(data)));
  }
}

function maskDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskDeep);
  }

  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    result[key] = key === 'publicId' && typeof v === 'string' ? maskDeviceId(v) : maskDeep(v);
  }
  return result;
}
