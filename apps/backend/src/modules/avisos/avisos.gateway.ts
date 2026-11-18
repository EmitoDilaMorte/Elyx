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
  puedeVerCondominio,
} from '../../common/auth/socket-auth';

@WebSocketGateway({
  namespace: '/ws/avisos',
  cors: corsSockets(),
})
export class AvisosGateway implements OnGatewayInit {
  private readonly logger = new Logger(AvisosGateway.name);

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

    if (!puedeVerCondominio(client, idCondominio)) {
      return;
    }

    client.join(this.getCondominioRoom(idCondominio));
  }

  emitAvisoChanged(idCondominio: number, payload: unknown) {
    this.server.to(this.getCondominioRoom(idCondominio)).emit('avisoChanged', payload);
  }

  private getCondominioRoom(idCondominio: number) {
    return `condominio:${idCondominio}`;
  }
}