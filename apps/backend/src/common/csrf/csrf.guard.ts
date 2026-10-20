import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_COOKIE } from '../auth/session-cookies';
import { CsrfService } from './csrf.service';
import { SKIP_CSRF_KEY } from './skip-csrf.decorator';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<'http' | 'ws' | 'rpc'>() !== 'http') {
      return true;
    }

    if (process.env.CSRF_ENABLED === 'false') {
      return true;
    }

    const omitir = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (omitir) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      headers: Record<string, string | string[] | undefined>;
      cookies?: Record<string, string | undefined>;
    }>();

    if (METODOS_SEGUROS.has(String(request.method ?? 'GET').toUpperCase())) {
      return true;
    }

    const cookie = request.cookies?.[CSRF_COOKIE];
    const headerRaw = request.headers['x-csrf-token'];
    const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    if (!cookie || !header || cookie !== header || !this.csrfService.esValido(cookie)) {
      throw new ForbiddenException('Token CSRF invalido o ausente. Recarga la pagina e intenta de nuevo.');
    }

    return true;
  }
}
