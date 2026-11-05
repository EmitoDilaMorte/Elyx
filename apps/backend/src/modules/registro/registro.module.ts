import { Module } from '@nestjs/common';
import { TurnstileModule } from '../../common/turnstile/turnstile.module';
import { CondominioAltaModule } from '../condominio-alta/condominio-alta.module';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';

@Module({
  imports: [CondominioAltaModule, TurnstileModule],
  controllers: [RegistroController],
  providers: [RegistroService],
})
export class RegistroModule {}
