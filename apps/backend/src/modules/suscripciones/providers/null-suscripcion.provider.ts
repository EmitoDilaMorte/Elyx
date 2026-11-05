import { Injectable } from '@nestjs/common';
import {
  CobroSuscripcion,
  DatosCobro,
  EstadoCobroProveedor,
  SuscripcionProvider,
} from './suscripcion-provider.interface';

/**
 * Sin cobro (self-hosting). `SUSCRIPCION_ENABLED=false` no crea suscripciones,
 * pero el proveedor existe para que el resto del codigo no tenga que ramificar.
 */
@Injectable()
export class NullSuscripcionProvider implements SuscripcionProvider {
  readonly nombre = 'NULL';
  readonly disponible = true;

  async crearCobro(datos: DatosCobro): Promise<CobroSuscripcion> {
    return {
      referencia: datos.referenciaSugerida,
      instrucciones: 'Esta instalacion de Elyx no cobra suscripcion.',
      monto: 0,
      moneda: datos.moneda,
      urlCheckout: null,
      modo: 'MANUAL',
      clientSecret: null,
      desglose: null,
    };
  }

  async consultarEstado(): Promise<EstadoCobroProveedor> {
    return 'PAGADO';
  }

  async cancelar(): Promise<void> {
    /* nada que cancelar */
  }
}
