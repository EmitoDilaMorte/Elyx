import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws/notificaciones',
  cors: {
    origin: '*',
  },
})
export class NotificacionesGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('joinCondominio')
  handleJoinCondominio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { idCondominio?: number },
  ) {
    if (!payload?.idCondominio || payload.idCondominio <= 0) {
      return;
    }

    client.join(this.getCondominioRoom(payload.idCondominio));
  }

  @SubscribeMessage('joinUsuarioCondominio')
  handleJoinUsuarioCondominio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { idUsuarioCondominio?: number },
  ) {
    if (!payload?.idUsuarioCondominio || payload.idUsuarioCondominio <= 0) {
      return;
    }

    client.join(this.getUsuarioRoom(payload.idUsuarioCondominio));
  }

  emitNotificacionChanged(idCondominio: number, idUsuarioCondominio: number, payload: unknown) {
    this.server.to(this.getCondominioRoom(idCondominio)).emit('notificacionChanged', payload);
    this.server.to(this.getUsuarioRoom(idUsuarioCondominio)).emit('notificacionChanged', payload);
  }

  emitConfigChanged(idCondominio: number, idUsuarioCondominio: number, payload: unknown) {
    this.server.to(this.getCondominioRoom(idCondominio)).emit('configNotificacionesChanged', payload);
    this.server.to(this.getUsuarioRoom(idUsuarioCondominio)).emit('configNotificacionesChanged', payload);
  }

  private getCondominioRoom(idCondominio: number) {
    return `condominio:${idCondominio}`;
  }

  private getUsuarioRoom(idUsuarioCondominio: number) {
    return `usuario-condominio:${idUsuarioCondominio}`;
  }
}
