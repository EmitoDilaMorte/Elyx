import { Module } from '@nestjs/common';
import { VotacionesController } from './votaciones.controller';
import { VotacionesService } from './votaciones.service';

@Module({
	controllers: [VotacionesController],
	providers: [VotacionesService],
})
export class VotacionesModule {}

