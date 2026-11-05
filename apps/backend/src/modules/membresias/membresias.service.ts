import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type RolMembresia = 'ADMINISTRADOR' | 'CONDOMINO';

/** Manager minimo compatible con `EntityManager` y con transacciones simples. */
type QueryManager = {
  query: (query: string, parameters?: unknown[]) => Promise<unknown[]>;
};

/**
 * Error de negocio: intentar dejar un condominio sin administradores.
 *
 * Es una excepcion propia para que la votacion pueda atraparla y marcar la
 * propuesta como RECHAZADA con motivo, en lugar de devolver un 400 al usuario
 * que cerro la votacion (el cierre si ocurrio; lo que no procede es el cambio).
 */
export class UltimoAdministradorException extends BadRequestException {
  constructor() {
    super(
      'No puedes degradar al ultimo administrador activo del condominio. Asigna otro administrador primero.',
    );
  }
}

export type ResultadoCambioRol = {
  idUsuarioCondominio: number;
  rolAnterior: RolMembresia;
  rolNuevo: RolMembresia;
  cambió: boolean;
};

/**
 * Unico punto de verdad para cambiar el rol de una membresia.
 *
 * Lo usan el endpoint del superusuario y la votacion de roles, de modo que la
 * regla "nunca dejar el condominio sin administradores" no se duplique (ni se
 * olvide en uno de los dos caminos).
 */
@Injectable()
export class MembresiasService {
  constructor(private readonly dataSource: DataSource) {}

  async cambiarRol(
    idCondominio: number,
    idUsuarioCondominio: number,
    rol: RolMembresia,
    managerExterno?: QueryManager,
  ): Promise<ResultadoCambioRol> {
    const ejecutar = async (manager: QueryManager): Promise<ResultadoCambioRol> => {
      const rows = await manager.query(
        `
        SELECT id_usuario_condominio, rol, estado
        FROM usuarios_condominios
        WHERE id_usuario_condominio = $1 AND id_condominio = $2
        FOR UPDATE
        `,
        [idUsuarioCondominio, idCondominio],
      );

      if (rows.length === 0) {
        throw new NotFoundException('La membresia indicada no existe en este condominio.');
      }

      const fila = rows[0] as Record<string, unknown>;
      const rolAnterior = String(fila.rol ?? 'CONDOMINO') as RolMembresia;

      if (rolAnterior === rol) {
        return {
          idUsuarioCondominio,
          rolAnterior,
          rolNuevo: rol,
          cambió: false,
        };
      }

      // Bloquear el condominio serializa dos degradaciones simultaneas: sin
      // esto, dos peticiones pueden leer "quedan 2 admins" y dejar 0.
      if (rolAnterior === 'ADMINISTRADOR' && rol === 'CONDOMINO') {
        await manager.query(
          `SELECT id_condominio FROM condominios WHERE id_condominio = $1 FOR UPDATE`,
          [idCondominio],
        );

        const conteo = await manager.query(
          `
          SELECT COUNT(*)::int AS total
          FROM usuarios_condominios
          WHERE id_condominio = $1 AND rol = 'ADMINISTRADOR' AND estado = 'ACTIVO'
          `,
          [idCondominio],
        );

        const total = Number((conteo[0] as Record<string, unknown>)?.total ?? 0);
        if (total <= 1) {
          throw new UltimoAdministradorException();
        }
      }

      await manager.query(
        `UPDATE usuarios_condominios SET rol = $2, estado = 'ACTIVO' WHERE id_usuario_condominio = $1`,
        [idUsuarioCondominio, rol],
      );

      return {
        idUsuarioCondominio,
        rolAnterior,
        rolNuevo: rol,
        cambió: true,
      };
    };

    if (managerExterno) {
      return ejecutar(managerExterno);
    }

    return this.dataSource.transaction((manager) => ejecutar(manager));
  }
}
