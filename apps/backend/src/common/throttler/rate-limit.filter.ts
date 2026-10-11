import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { RateLimitException } from './rate-limit.exception';

/**
 * Emite respuestas 429 consistentes incluyendo la cabecera `Retry-After`,
 * que el cliente (web o movil) usa para saber cuando puede reintentar.
 */
@Catch(RateLimitException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: RateLimitException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = exception.getResponse();

    response.setHeader('Retry-After', String(exception.retryAfterSeconds));

    if (response.headersSent) {
      return;
    }

    response.status(HttpStatus.TOO_MANY_REQUESTS).json(
      typeof body === 'string'
        ? {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Too Many Requests',
            message: body,
            retryAfter: exception.retryAfterSeconds,
          }
        : body,
    );
  }
}
