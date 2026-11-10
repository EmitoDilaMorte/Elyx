import type {
  AppData,
  Aviso,
  Cuota,
  Gasto,
  MantenimientoReporte,
  Pago,
  ReporteFinanciero,
  VotacionActiva,
} from '../types/app';

export type CondominioScope = {
  cuotas: Cuota[];
  pagos: Pago[];
  avisos: Aviso[];
  votacionesActivas: VotacionActiva[];
  mantenimientos: MantenimientoReporte[];
  gastos: Gasto[];
  reportes: ReporteFinanciero[];
};

export type CrearAvisoInput = {
  idCondominio: number;
  idUsuarioCondominioAdmin: number;
  titulo: string;
  mensaje: string;
  fecha: string;
};

export type CrearVotacionInput = {
  idCondominio: number;
  pregunta: string;
};

export type CerrarVotacionInput = {
  idCondominio: number;
  idVotacion: number;
};

export function getCondominioScope(data: AppData, idCondominio: number): CondominioScope {
  return {
    cuotas: data.cuotas.filter((item) => item.idCondominio === idCondominio),
    pagos: data.pagos.filter((item) => item.idCondominio === idCondominio),
    avisos: data.avisos
      .filter((item) => item.idCondominio === idCondominio)
      .slice()
      .reverse(),
    votacionesActivas: data.votacionesActivas.filter((item) => item.idCondominio === idCondominio),
    mantenimientos: data.mantenimientos.filter((item) => item.idCondominio === idCondominio),
    gastos: data.gastos
      .filter((item) => item.idCondominio === idCondominio)
      .slice()
      .reverse(),
    reportes: data.reportes.filter((item) => item.idCondominio === idCondominio),
  };
}

export function createAvisoInCondominio(data: AppData, input: CrearAvisoInput): AppData {
  const nuevoAviso: Aviso = {
    id: data.nextIds.aviso,
    idCondominio: input.idCondominio,
    titulo: input.titulo,
    mensaje: input.mensaje,
    fecha: input.fecha,
    idUsuarioCondominioAdmin: input.idUsuarioCondominioAdmin,
  };

  return {
    ...data,
    avisos: [...data.avisos, nuevoAviso],
    nextIds: {
      ...data.nextIds,
      aviso: data.nextIds.aviso + 1,
    },
  };
}

export function createVotacionInCondominio(data: AppData, input: CrearVotacionInput): AppData {
  const nuevaVotacion: VotacionActiva = {
    id: data.nextIds.votacion,
    idCondominio: input.idCondominio,
    pregunta: input.pregunta,
    tipo: 'GENERAL',
    cambioCuota: null,
    aFavor: 0,
    enContra: 0,
    votosPorUsuario: {},
  };

  return {
    ...data,
    votacionesActivas: [nuevaVotacion, ...data.votacionesActivas],
    nextIds: {
      ...data.nextIds,
      votacion: data.nextIds.votacion + 1,
    },
  };
}

export function closeVotacionInCondominio(data: AppData, input: CerrarVotacionInput): AppData {
  return {
    ...data,
    votacionesActivas: data.votacionesActivas.filter(
      (item) => !(item.idCondominio === input.idCondominio && item.id === input.idVotacion),
    ),
  };
}

export function getCobranzaProgreso(cuotas: Cuota[]): { pagadas: number; total: number; porcentaje: number } {
  const pagadas = cuotas.filter((cuota) => cuota.status === 'PAGADA').length;
  const total = cuotas.length;
  const porcentaje = total === 0 ? 0 : Math.round((pagadas / total) * 100);

  return { pagadas, total, porcentaje };
}

export function getVotacionesPendientes(votaciones: VotacionActiva[], correoUsuario: string): number {
  return votaciones.filter((item) => !item.votosPorUsuario[correoUsuario]).length;
}