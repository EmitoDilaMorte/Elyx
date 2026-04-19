import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/ws/votaciones',
  cors: {
    origin: '*',
  },
})
export class VotacionesGateway {
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

  emitVotacionChanged(idCondominio: number, payload: unknown) {
    this.server.to(this.getCondominioRoom(idCondominio)).emit('votacionChanged', payload);
  }

  private getCondominioRoom(idCondominio: number) {
    return `condominio:${idCondominio}`;
  }
}
