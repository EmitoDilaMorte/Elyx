import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module';
import { MembresiasModule } from '../membresias/membresias.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { VotacionesController } from './votaciones.controller';
import { VotacionesGateway } from './votaciones.gateway';
import { VotacionesService } from './votaciones.service';

@Module({
	imports: [AvisosModule, MembresiasModule, NotificacionesModule],
	controllers: [VotacionesController],
	providers: [VotacionesService, VotacionesGateway],
})
export class VotacionesModule {}

