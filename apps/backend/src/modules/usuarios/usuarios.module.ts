import { Module } from '@nestjs/common';
import { CondominioAltaModule } from '../condominio-alta/condominio-alta.module';
import { MembresiasModule } from '../membresias/membresias.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
	imports: [CondominioAltaModule, MembresiasModule],
	controllers: [UsuariosController],
	providers: [UsuariosService],
})
export class UsuariosModule {}

