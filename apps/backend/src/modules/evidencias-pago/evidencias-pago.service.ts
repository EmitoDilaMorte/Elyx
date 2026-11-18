import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { join } from 'path';
import { CreateEvidenciaPagoDto } from './dto/create-evidencia-pago.dto';
import { EvidenciasPagoGateway } from './evidencias-pago.gateway';

type EvidenciaPagoRecord = {
  idEvidencia: number;
  /** Pago al que cuelga la evidencia, o `null` si aun espera conciliacion. */
  idPago: number | null;
  /** Cargo en linea al que cuelga la evidencia mientras esta pendiente. */
  idCargo: number | null;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
};

@Injectable()
export class EvidenciasPagoService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly evidenciasPagoGateway: EvidenciasPagoGateway,
  ) {}

  private getPublicFilesBaseUrl(): string {
    const configured = process.env.PUBLIC_FILES_BASE_URL?.trim();
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    return 'http://localhost:3000';
  }

  async listByCondominio(
    idCondominio: number,
    idPago?: number,
    idCargo?: number,
  ): Promise<EvidenciaPagoRecord[]> {
    const params: Array<number> = [idCondominio];
    let pagoClause = '';
    let cargoClause = '';

    if (idPago) {
      params.push(idPago);
      pagoClause = ` AND e.id_pago = $${params.length}`;
    }

    if (idCargo) {
      params.push(idCargo);
      cargoClause = ` AND e.id_cargo = $${params.length}`;
    }

    /*
     * La cuota se resuelve por el pago o, si la evidencia todavia espera
     * conciliacion, por el cargo. Un INNER JOIN a `pagos` dejaria fuera los
     * comprobantes de transferencias que aun no se confirman.
     */
    const rows = await this.dataSource.query(
      `
      SELECT
        e.id_evidencia,
        e.id_pago,
        e.id_cargo,
        c.id_condominio,
        e.nombre_archivo,
        e.url_archivo,
        e.fecha_carga
      FROM evidencias_pago e
      LEFT JOIN pagos p ON p.id_pago = e.id_pago
      LEFT JOIN cargos_cuota cc ON cc.id_cargo = e.id_cargo
      INNER JOIN cuotas c ON c.id_cuota = COALESCE(p.id_cuota, cc.id_cuota)
      WHERE c.id_condominio = $1${pagoClause}${cargoClause}
      ORDER BY e.fecha_carga DESC
      `,
      params,
    );

    return rows.map((row: Record<string, unknown>) => this.toRecord(row));
  }

  async create(input: CreateEvidenciaPagoDto, archivo: Express.Multer.File): Promise<EvidenciaPagoRecord> {
    if (!input.idPago && !input.idCargo) {
      throw new BadRequestException(
        'Indica el pago o la transferencia a la que pertenece el comprobante.',
      );
    }

    if (input.idPago && input.idCargo) {
      throw new BadRequestException('El comprobante pertenece a un pago o a una transferencia, no a ambos.');
    }

    /*
     * `multer` guarda el archivo ANTES de que este metodo valide el destino. Si
     * la validacion falla, hay que borrarlo o queda basura en uploads/.
     */
    try {
      return await this.guardarEvidencia(input, archivo);
    } catch (error) {
      this.borrarArchivo(archivo.filename);
      throw error;
    }
  }

  private async guardarEvidencia(
    input: CreateEvidenciaPagoDto,
    archivo: Express.Multer.File,
  ): Promise<EvidenciaPagoRecord> {
    return this.dataSource.transaction(async (manager) => {
      const safeFilename = archivo.filename;
      if (!safeFilename) {
        throw new BadRequestException('No fue posible guardar el archivo de comprobante.');
      }

      const baseUrl = this.getPublicFilesBaseUrl();
      const urlArchivo = `${baseUrl}/uploads/evidencias/${safeFilename}`;

      if (input.idPago) {
        const pagoRows = await manager.query(
          `
          SELECT p.id_pago
          FROM pagos p
          INNER JOIN cuotas c ON c.id_cuota = p.id_cuota
          WHERE p.id_pago = $1 AND c.id_condominio = $2
          LIMIT 1
          `,
          [input.idPago, input.idCondominio],
        );

        if (pagoRows.length === 0) {
          throw new NotFoundException('No se encontro el pago para el condominio indicado.');
        }
      } else {
        /*
         * Solo se aceptan cargos PENDIENTES: si ya se pago o se cancelo, la
         * transferencia dejo de existir y el comprobante pertenece al pago.
         */
        const cargoRows = await manager.query(
          `
          SELECT id_cargo
          FROM cargos_cuota
          WHERE id_cargo = $1 AND id_condominio = $2 AND estado = 'PENDIENTE'
          LIMIT 1
          `,
          [input.idCargo, input.idCondominio],
        );

        if (cargoRows.length === 0) {
          throw new NotFoundException(
            'No se encontro una transferencia pendiente para el condominio indicado.',
          );
        }
      }

      const createdRows = await manager.query(
        `
        INSERT INTO evidencias_pago (nombre_archivo, url_archivo, fecha_carga, id_pago, id_cargo)
        VALUES ($1, $2, NOW(), $3, $4)
        RETURNING id_evidencia, id_pago, id_cargo, nombre_archivo, url_archivo, fecha_carga
        `,
        [
          (input.nombreArchivo || archivo.originalname).trim(),
          urlArchivo,
          input.idPago ?? null,
          input.idCargo ?? null,
        ],
      );

      if (createdRows.length === 0) {
        throw new BadRequestException('No fue posible crear la evidencia de pago.');
      }

      const row = createdRows[0] as Record<string, unknown>;
      const evidencia = this.toRecord({ ...row, id_condominio: input.idCondominio });

      this.evidenciasPagoGateway.emitEvidenciaChanged(input.idCondominio, {
        tipo: 'CREADA',
        evidencia,
      });

      return evidencia;
    });
  }

  async delete(idEvidencia: number, idCondominio: number): Promise<{ ok: boolean }> {
    const rows = await this.dataSource.query(
      `
      SELECT
        e.id_evidencia,
        e.url_archivo,
        p.estado AS pago_estado,
        cc.estado AS cargo_estado,
        c.id_condominio
      FROM evidencias_pago e
      LEFT JOIN pagos p ON p.id_pago = e.id_pago
      LEFT JOIN cargos_cuota cc ON cc.id_cargo = e.id_cargo
      INNER JOIN cuotas c ON c.id_cuota = COALESCE(p.id_cuota, cc.id_cuota)
      WHERE e.id_evidencia = $1 AND c.id_condominio = $2
      LIMIT 1
      `,
      [idEvidencia, idCondominio],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Evidencia de pago no encontrada en este condominio.');
    }

    const row = rows[0] as Record<string, unknown>;
    /*
     * Se puede retirar mientras el destino siga abierto: un pago pendiente de
     * revision o una transferencia que aun no se concilia. Una vez validado o
     * conciliado el comprobante es parte del historial.
     */
    const editable =
      String(row.cargo_estado ?? '') === 'PENDIENTE' ||
      String(row.pago_estado ?? '') === 'CAPTURADO';

    if (!editable) {
      throw new ForbiddenException('No se puede eliminar el comprobante de un pago ya validado o rechazado.');
    }

    const urlArchivo = String(row.url_archivo);

    await this.dataSource.query(
      `DELETE FROM evidencias_pago WHERE id_evidencia = $1`,
      [idEvidencia],
    );

    this.borrarArchivo(urlArchivo.split('/').pop() ?? null);

    this.evidenciasPagoGateway.emitEvidenciaChanged(idCondominio, {
      tipo: 'ELIMINADA',
      idEvidencia,
    });

    return { ok: true };
  }

  /** Borra un archivo de `uploads/evidencias`. Nunca lanza: es best-effort. */
  private borrarArchivo(nombreArchivo: string | null): void {
    if (!nombreArchivo) {
      return;
    }

    try {
      const filePath = join(process.cwd(), 'uploads', 'evidencias', nombreArchivo);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Un archivo huerfano no debe romper la peticion.
    }
  }

  private toRecord(row: Record<string, unknown>): EvidenciaPagoRecord {
    return {
      idEvidencia: Number(row.id_evidencia),
      idPago: row.id_pago ? Number(row.id_pago) : null,
      idCargo: row.id_cargo ? Number(row.id_cargo) : null,
      idCondominio: Number(row.id_condominio),
      nombreArchivo: String(row.nombre_archivo),
      urlArchivo: String(row.url_archivo),
      fechaCarga: new Date(String(row.fecha_carga)).toISOString(),
    };
  }
}
