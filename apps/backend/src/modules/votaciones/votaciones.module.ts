import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module';
import { VotacionesController } from './votaciones.controller';
import { VotacionesGateway } from './votaciones.gateway';
import { VotacionesService } from './votaciones.service';

@Module({
	imports: [AvisosModule],
	controllers: [VotacionesController],
	providers: [VotacionesService, VotacionesGateway],
})
export class VotacionesModule {}

