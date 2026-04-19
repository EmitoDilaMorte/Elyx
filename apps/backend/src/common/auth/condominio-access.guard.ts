import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

type Membership = {
  idCondominio: number;
  rol: string;
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
export class CondominioAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    // In local mode this guard can be bypassed to keep development flows simple.
    if (process.env.AUTH_REQUIRED !== 'true' && !request.user) {
      return true;
    }

    if (!request.user) {
      throw new UnauthorizedException('Autenticacion requerida.');
    }

    if (request.user.isSuperuser) {
      return true;
    }

    const idCondominio = this.extractCondominioId(request);
    if (!idCondominio) {
      return true;
    }

    const memberships = request.user.memberships ?? [];
    const hasAccess = memberships.some((membership) => Number(membership.idCondominio) === idCondominio);

    if (!hasAccess) {
      throw new ForbiddenException('No tienes acceso al condominio solicitado.');
    }

    return true;
  }

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