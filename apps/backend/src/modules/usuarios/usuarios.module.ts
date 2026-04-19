import { Module } from '@nestjs/common';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
	imports: [NotificacionesModule],
	controllers: [UsuariosController],
	providers: [UsuariosService],
})
export class UsuariosModule {}

