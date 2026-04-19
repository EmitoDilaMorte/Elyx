import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      if (process.env.AUTH_REQUIRED !== 'true') {
        return true;
      }
      throw new UnauthorizedException('Autenticacion requerida.');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato de token invalido.');
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'elyx-dev-secret');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido o expirado.');
    }
  }
}
