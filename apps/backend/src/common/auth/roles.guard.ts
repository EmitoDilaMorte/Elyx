import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './role.enum';
import { ROLES_KEY } from './roles.decorator';

type AuthRequest = {
  user?: {
    memberships?: Array<{ rol: Role }>;
    isSuperuser?: boolean;
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.user) {
      if (process.env.AUTH_REQUIRED !== 'true') {
        return true;
      }
      throw new UnauthorizedException('Autenticacion requerida.');
    }

    if (request.user.isSuperuser && requiredRoles.includes(Role.SUPERUSER)) {
      return true;
    }

    const memberships = request.user.memberships ?? [];
    const hasRole = memberships.some((membership) => requiredRoles.includes(membership.rol));

    if (!hasRole) {
      throw new ForbiddenException('No tienes permisos para realizar esta accion.');
    }

    return true;
  }
}
