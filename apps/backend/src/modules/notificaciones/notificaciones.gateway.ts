import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  aplicarAutenticacionSocket,
  corsSockets,
  esMiembroUsuario,
  puedeVerCondominio,
} from '../../common/auth/socket-auth';

/**
 * WebSocket de notificaciones.
 *
 * Valida el JWT en el handshake y comprueba que el usuario pertenezca al
 * condominio antes de unirlo a la room. Sin eso, cualquiera podia conectarse y
 * escuchar notificaciones de un condominio ajeno con solo enviar un
 * `idCondominio`.
 *
 * El cliente envia el access token en `auth.token`: Socket.IO lo pasa en el
 * payload del handshake, no en la URL, asi que no queda en los logs del proxy.
 */
@WebSocketGateway({
  namespace: '/ws/notificaciones',
  cors: corsSockets(),
})
export class NotificacionesGateway implements OnGatewayInit {
  private readonly logger = new Logger(NotificacionesGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit(server: Server) {
    aplicarAutenticacionSocket(server, this.logger);
  }

  @SubscribeMessage('joinCondominio')
  handleJoinCondominio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { idCondominio?: number },
  ) {
    const idCondominio = Number(payload?.idCondominio ?? 0);
    if (!Number.isInteger(idCondominio) || idCondominio <= 0) {
      return;
    }

    if (!this.puedeVer(client, idCondominio)) {
      this.logger.warn(`Socket ${client.id} intento unirse al condominio ${idCondominio} sin permiso.`);
      return;
    }

    client.join(this.getCondominioRoom(idCondominio));
  }

  @SubscribeMessage('joinUsuarioCondominio')
  handleJoinUsuarioCondominio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { idUsuarioCondominio?: number },
  ) {
    const idUsuarioCondominio = Number(payload?.idUsuarioCondominio ?? 0);
    if (!Number.isInteger(idUsuarioCondominio) || idUsuarioCondominio <= 0) {
      return;
    }

    if (!this.esMiembro(client, idUsuarioCondominio)) {
      this.logger.warn(
        `Socket ${client.id} intento unirse al usuario-condominio ${idUsuarioCondominio} sin permiso.`,
      );
      return;
    }

    client.join(this.getUsuarioRoom(idUsuarioCondominio));
  }

  emitNotificacionChanged(idCondominio: number, idUsuarioCondominio: number, payload: unknown) {
    this.server.to(this.getCondominioRoom(idCondominio)).emit('notificacionChanged', payload);
    this.server.to(this.getUsuarioRoom(idUsuarioCondominio)).emit('notificacionChanged', payload);
  }

  emitConfigChanged(idCondominio: number, idUsuarioCondominio: number, payload: unknown) {
    this.server.to(this.getCondominioRoom(idCondominio)).emit('configNotificacionesChanged', payload);
    this.server.to(this.getUsuarioRoom(idUsuarioCondominio)).emit('configNotificacionesChanged', payload);
  }

  private puedeVer(client: Socket, idCondominio: number): boolean {
    return puedeVerCondominio(client, idCondominio);
  }

  private esMiembro(client: Socket, idUsuarioCondominio: number): boolean {
    return esMiembroUsuario(client, idUsuarioCondominio);
  }

  private getCondominioRoom(idCondominio: number) {
    return `condominio:${idCondominio}`;
  }

  private getUsuarioRoom(idUsuarioCondominio: number) {
    return `usuario-condominio:${idUsuarioCondominio}`;
  }
}
