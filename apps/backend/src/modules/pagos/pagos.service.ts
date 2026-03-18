import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PagoEstado } from '../../common/enums/pago-estado.enum';
import { AprobarPagoDto, RechazarPagoDto } from './dto/actualizar-pago.dto';
import { CapturarPagoDto } from './dto/capturar-pago.dto';
import { CuotasService } from '../cuotas/cuotas.service';

type PagoRecord = {
  idPago: number;
  idCondominio: number;
  idCuota: number;
  monto: number;
  fechaPago: string;
  estado: PagoEstado;
  idUsuarioCondominioPaga: number;
  idUsuarioCondominioAdmin: number | null;
  motivoRechazo: string | null;
};

@Injectable()
export class PagosService {
  private nextPagoId = 2500;

  constructor(private readonly cuotasService: CuotasService) {}

  private readonly pagos: PagoRecord[] = [
    {
      idPago: 2421,
      idCondominio: 101,
      idCuota: 1,
      monto: 1850,
      fechaPago: '2026-03-16T14:15:00.000Z',
      estado: PagoEstado.CAPTURADO,
      idUsuarioCondominioPaga: 1001,
      idUsuarioCondominioAdmin: null,
      motivoRechazo: null,
    },
    {
      idPago: 2422,
      idCondominio: 202,
      idCuota: 3,
      monto: 1650,
      fechaPago: '2026-03-17T10:10:00.000Z',
      estado: PagoEstado.CAPTURADO,
      idUsuarioCondominioPaga: 1002,
      idUsuarioCondominioAdmin: null,
      motivoRechazo: null,
    },
  ];

  listByCondominio(idCondominio: number, estado?: PagoEstado): PagoRecord[] {
    return this.pagos
      .filter((item) => item.idCondominio === idCondominio)
      .filter((item) => (estado ? item.estado === estado : true))
      .sort((a, b) => b.fechaPago.localeCompare(a.fechaPago));
  }

  capturar(input: CapturarPagoDto): PagoRecord {
    const cuota = this.cuotasService.findByCondominioAndId(input.idCondominio, input.idCuota);

    if (cuota.estado !== 'PENDIENTE') {
      throw new BadRequestException('Solo se pueden capturar pagos para cuotas pendientes.');
    }

    const pagoExistente = this.pagos.find(
      (item) => item.idCondominio === input.idCondominio && item.idCuota === input.idCuota,
    );
    if (pagoExistente && pagoExistente.estado !== PagoEstado.RECHAZADO) {
      throw new BadRequestException('La cuota ya tiene un pago capturado o validado.');
    }

    const nuevoPago: PagoRecord = {
      idPago: this.nextPagoId,
      idCondominio: input.idCondominio,
      idCuota: input.idCuota,
      monto: cuota.monto,
      fechaPago: new Date().toISOString(),
      estado: PagoEstado.CAPTURADO,
      idUsuarioCondominioPaga: input.idUsuarioCondominioPaga,
      idUsuarioCondominioAdmin: null,
      motivoRechazo: null,
    };

    this.nextPagoId += 1;
    this.pagos.push(nuevoPago);
    this.cuotasService.markEnValidacion(input.idCondominio, input.idCuota);
    return nuevoPago;
  }

  aprobar(input: AprobarPagoDto): PagoRecord {
    const pago = this.pagos.find((item) => item.idPago === input.idPago && item.idCondominio === input.idCondominio);
    if (!pago) {
      throw new NotFoundException('No se encontro el pago para el condominio indicado.');
    }

    if (pago.estado !== PagoEstado.CAPTURADO) {
      throw new BadRequestException('Solo se pueden aprobar pagos en estado CAPTURADO.');
    }

    pago.estado = PagoEstado.VALIDADO;
    pago.idUsuarioCondominioAdmin = input.idUsuarioCondominioAdmin;
    pago.motivoRechazo = null;
    this.cuotasService.markPagada(input.idCondominio, pago.idCuota);
    return pago;
  }

  rechazar(input: RechazarPagoDto): PagoRecord {
    const pago = this.pagos.find((item) => item.idPago === input.idPago && item.idCondominio === input.idCondominio);
    if (!pago) {
      throw new NotFoundException('No se encontro el pago para el condominio indicado.');
    }

    if (pago.estado !== PagoEstado.CAPTURADO) {
      throw new BadRequestException('Solo se pueden rechazar pagos en estado CAPTURADO.');
    }

    pago.estado = PagoEstado.RECHAZADO;
    pago.idUsuarioCondominioAdmin = input.idUsuarioCondominioAdmin;
    pago.motivoRechazo = input.motivoRechazo.trim();
    this.cuotasService.markPendiente(input.idCondominio, pago.idCuota);
    return pago;
  }
}