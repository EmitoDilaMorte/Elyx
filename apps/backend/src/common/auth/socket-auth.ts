import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';

export type MembresiaToken = {
  idUsuarioCondominio: number;
  idCondominio: number;
  rol: string;
};

type TokenPayload = {
  sub?: number;
  correo?: string;
  memberships?: MembresiaToken[];
  isSuperuser?: boolean;
};

export type SocketData = {
  membresias?: MembresiaToken[];
  isSuperuser?: boolean;
};

/**
 * Autenticacion de WebSockets.
 *
 * Todos los gateways de la app emitian eventos con `cors: { origin: '*' }` y
 * aceptaban `joinCondominio` con cualquier id, asi que cualquiera podia
 * suscribirse a los cambios de un condominio ajeno. Este helper centraliza la
 * verificacion para no repetirla (ni olvidarla) en cada gateway.
 *
 * Se puede desactivar en desarrollo con `AUTH_REQUIRED != 'true'`, igual que los
 * guards HTTP.
 */

/** CORS del handshake: allowlist real en produccion, abierto en desarrollo. */
export function corsSockets() {
  const origenes = new Set<string>();

  for (const origen of (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',')) {
    const limpio = origen.trim();
    if (limpio) {
      origenes.add(limpio);
    }
  }

  // Mismo criterio que `buildCorsOptions` en `main.ts`: si no hay lista
  // explicita se usa `FRONTEND_URL`, y fuera de produccion se acepta local.
  const frontendUrl = (process.env.FRONTEND_URL ?? '').trim();
  if (frontendUrl) {
    origenes.add(frontendUrl);
  }

  if (process.env.NODE_ENV !== 'production') {
    origenes.add('http://localhost:5173');
    origenes.add('http://127.0.0.1:5173');
  }

  // Sin ninguna referencia configurada se refleja el origen del cliente. Es lo
  // que hacia antes con `origin: '*'` y evita romper instalaciones locales.
  if (origenes.size === 0) {
    return { origin: true, credentials: true };
  }

  return { origin: Array.from(origenes), credentials: true };
}

function extraerToken(socket: Socket): string | null {
  const authToken = (socket.handshake.auth as { token?: string } | undefined)?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.trim();
  }

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return null;
}

/**
 * Instala el middleware de autenticacion en un namespace.
 *
 * El cliente envia el access token en `auth.token`; si el token falta o es
 * invalido, el handshake se rechaza y el socket nunca llega a unirse a una room.
 */
export function aplicarAutenticacionSocket(server: Server, logger: Logger): void {
  server.use((socket: Socket, next) => {
    const data = socket.data as SocketData;

    if (process.env.AUTH_REQUIRED !== 'true') {
      next();
      return;
    }

    const token = extraerToken(socket);
    if (!token) {
      next(new Error('Autenticacion requerida.'));
      return;
    }

    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET ?? 'elyx-dev-secret',
      ) as TokenPayload;

      data.membresias = Array.isArray(payload.memberships) ? payload.memberships : [];
      data.isSuperuser = Boolean(payload.isSuperuser);
      next();
    } catch {
      logger.warn(`Handshake rechazado: token invalido (socket ${socket.id}).`);
      next(new Error('Token invalido o expirado.'));
    }
  });
}

/** `true` si el socket puede escuchar ese condominio. */
export function puedeVerCondominio(client: Socket, idCondominio: number): boolean {
  if (process.env.AUTH_REQUIRED !== 'true') {
    return true;
  }

  const data = client.data as SocketData;
  if (data.isSuperuser) {
    return true;
  }

  return (data.membresias ?? []).some(
    (membresia) => Number(membresia.idCondominio) === idCondominio,
  );
}

/** `true` si el socket corresponde a ese usuario-condominio. */
export function esMiembroUsuario(client: Socket, idUsuarioCondominio: number): boolean {
  if (process.env.AUTH_REQUIRED !== 'true') {
    return true;
  }

  if ((client.data as SocketData).isSuperuser) {
    return true;
  }

  return (
    (client.data as SocketData).membresias?.some(
      (membresia) => Number(membresia.idUsuarioCondominio) === idUsuarioCondominio,
    ) ?? false
  );
}
