import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './role.enum';
import { ROLES_KEY } from './roles.decorator';

type Membership = {
  idCondominio: number;
  rol: Role;
};

type AuthRequest = {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  user?: {
    memberships?: Membership[];
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
    const idCondominio = this.extractCondominioId(request);

    /*
     * Si la peticion identifica un condominio, el rol tiene que ser el de ESA
     * membresia. Antes bastaba con ser administrador en cualquier condominio:
     * un admin del condo A podia aprobar pagos del condo B donde solo era
     * condomino. Las rutas que no reciben condominio conservan el rol global.
     */
    const hasRole =
      idCondominio === null
        ? memberships.some((membership) => requiredRoles.includes(membership.rol))
        : memberships.some(
            (membership) =>
              Number(membership.idCondominio) === idCondominio &&
              requiredRoles.includes(membership.rol),
          );

    if (!hasRole) {
      throw new ForbiddenException('No tienes permisos para realizar esta accion.');
    }

    return true;
  }

  /** Mismo criterio que `CondominioAccessGuard` para no divergir. */
  private extractCondominioId(request: AuthRequest): number | null {
    const candidates = [
      request.query?.idCondominio,
      request.params?.idCondominio,
      request.body?.idCondominio,
      request.query?.id_condominio,
      request.params?.id_condominio,
      request.body?.id_condominio,
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) {
        continue;
      }
      const numeric = Number(candidate);
      if (Number.isInteger(numeric) && numeric > 0) {
        return numeric;
      }
    }

    return null;
  }
}
