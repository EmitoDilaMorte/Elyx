import { Injectable, Logger } from '@nestjs/common';
import {
  CobroSuscripcion,
  DatosCobro,
  EstadoCobroProveedor,
  SuscripcionProvider,
} from './suscripcion-provider.interface';

/**
 * Proveedor por transferencia/efectivo: genera una referencia y muestra las
 * instrucciones configuradas en `SUSCRIPCION_DATOS_PAGO`. El pago lo confirma
 * el superusuario, asi que `consultarEstado` siempre devuelve PENDIENTE.
 */
@Injectable()
export class ManualSuscripcionProvider implements SuscripcionProvider {
  readonly nombre = 'MANUAL';
  readonly disponible = true;

  private readonly logger = new Logger(ManualSuscripcionProvider.name);

  async crearCobro(datos: DatosCobro): Promise<CobroSuscripcion> {
    const instrucciones = (process.env.SUSCRIPCION_DATOS_PAGO ?? '').trim();

    return {
      referencia: datos.referenciaSugerida,
      instrucciones:
        instrucciones ||
        'Contacta al administrador de la plataforma para completar el pago de tu suscripcion.',
      monto: datos.monto,
      moneda: datos.moneda,
      urlCheckout: null,
      modo: 'MANUAL',
      clientSecret: null,
      desglose: null,
    };
  }

  async consultarEstado(referencia: string): Promise<EstadoCobroProveedor> {
    // Sin integracion: el estado solo cambia cuando el superusuario lo confirma.
    this.logger.debug(`Consulta de estado manual para ${referencia}: PENDIENTE`);
    return 'PENDIENTE';
  }

  async cancelar(referencia: string): Promise<void> {
    this.logger.debug(`Cancelacion manual solicitada para ${referencia}`);
  }
}
