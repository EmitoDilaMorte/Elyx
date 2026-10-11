import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { RateLimitExceptionFilter } from './common/throttler/rate-limit.filter';
import { ThrottlerBehindProxyGuard } from './common/throttler/throttler-behind-proxy.guard';
import { AdministradoresModule } from './modules/administradores/administradores.module';
import { AvisosModule } from './modules/avisos/avisos.module';
import { AuthModule } from './modules/auth/auth.module';
import { CondominosModule } from './modules/condominos/condominos.module';
import { ConfigNotificacionesModule } from './modules/config-notificaciones/config-notificaciones.module';
import { CuotasModule } from './modules/cuotas/cuotas.module';
import { EvidenciasPagoModule } from './modules/evidencias-pago/evidencias-pago.module';
import { FotosMantenimientoModule } from './modules/fotos-mantenimiento/fotos-mantenimiento.module';
import { GastosModule } from './modules/gastos/gastos.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { PagosModule } from './modules/pagos/pagos.module';
import { RecibosModule } from './modules/recibos/recibos.module';
import { ReportesFinancierosModule } from './modules/reportes-financieros/reportes-financieros.module';
import { ReportesMantenimientoModule } from './modules/reportes-mantenimiento/reportes-mantenimiento.module';
import { UnidadesModule } from './modules/unidades/unidades.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { VotacionesModule } from './modules/votaciones/votaciones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Los contadores viven en Redis para compartirse entre instancias del
    // backend y sobrevivir a reinicios. Si se omite `storage`, @nestjs/throttler
    // vuelve al almacenamiento en memoria sin avisar.
    //
    // Se usa un UNICO conjunto (`default`): en @nestjs/throttler v5+ todos los
    // conjuntos del root se aplican a cada ruta, asi que definir varios aqui
    // limitaria tambien los endpoints que no los necesitan. Los limites
    // especificos se ajustan por ruta con @Throttle en cada controlador.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: seconds(60), limit: 60 }],
      storage: new ThrottlerStorageRedisService(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
      logging: false,
    }),
    AuthModule,
    UsuariosModule,
    CondominosModule,
    AdministradoresModule,
    CuotasModule,
    PagosModule,
    RecibosModule,
    EvidenciasPagoModule,
    MailModule,
    AvisosModule,
    VotacionesModule,
    ReportesMantenimientoModule,
    FotosMantenimientoModule,
    ConfigNotificacionesModule,
    NotificacionesModule,
    GastosModule,
    ReportesFinancierosModule,
    UnidadesModule,
  ],
  controllers: [AppController],
  providers: [
    // Rate limiting global (por usuario autenticado o por IP).
    { provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard },
    // Respuestas 429 uniformes con cabecera `Retry-After`.
    { provide: APP_FILTER, useClass: RateLimitExceptionFilter },
  ],
})
export class AppModule {}
