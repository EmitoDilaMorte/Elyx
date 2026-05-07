import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
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
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { VotacionesModule } from './modules/votaciones/votaciones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [AppController],
})
export class AppModule {}
