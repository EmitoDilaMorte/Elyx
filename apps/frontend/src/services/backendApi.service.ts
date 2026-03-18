import type { PagoStatus, VoteChoice } from '../types/app';

type BackendCuota = {
  idCuota: number;
  idCondominio: number;
  periodo: string;
  monto: number;
  fechaLimite: string;
  recargo: number;
  estado: 'PENDIENTE' | 'EN_VALIDACION' | 'PAGADA';
};

type BackendAviso = {
  idAviso: number;
  idCondominio: number;
  idUsuarioCondominioAdmin: number;
  titulo: string;
  contenido: string;
  fechaPublicacion: string;
};

type BackendVotacion = {
  idVotacion: number;
  idCondominio: number;
  pregunta: string;
  estado: 'ABIERTA' | 'CERRADA';
  fechaInicio: string;
  fechaFin: string;
  aFavor: number;
  enContra: number;
  totalVotos: number;
};

type BackendPago = {
  idPago: number;
  idCondominio: number;
  idCuota: number;
  monto: number;
  fechaPago: string;
  estado: 'CAPTURADO' | 'VALIDADO' | 'RECHAZADO';
  idUsuarioCondominioPaga: number;
  idUsuarioCondominioAdmin: number | null;
  motivoRechazo: string | null;
};

type BackendMantenimiento = {
  idReporte: number;
  idCondominio: number;
  unidad: string;
  descripcion: string;
  fecha: string;
  estado: 'NUEVO' | 'EN_PROCESO' | 'RESUELTO';
  idUsuarioCondominioReporta: number;
  idUsuarioCondominioAdmin: number | null;
};

type BackendGasto = {
  idGasto: number;
  idCondominio: number;
  concepto: string;
  categoria: string;
  monto: number;
  fecha: string;
};

type BackendReporteFinanciero = {
  idCondominio: number;
  periodo: string;
  ingresos: number;
  gastos: number;
  adeudos: number;
};

function getApiBaseUrl() {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const base = raw && raw.length > 0 ? raw : 'http://localhost:3000';
  return base.endsWith('/api') ? base : `${base}/api`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || 'Error desconocido'}`);
  }

  return (await response.json()) as T;
}

function formatDateLabel(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapPagoStatus(status: BackendPago['estado']): PagoStatus {
  if (status === 'VALIDADO') {
    return 'APROBADO';
  }
  if (status === 'RECHAZADO') {
    return 'RECHAZADO';
  }
  return 'PENDIENTE';
}

export const backendApi = {
  async listCuotas(idCondominio: number) {
    const data = await requestJson<BackendCuota[]>(`/cuotas?idCondominio=${idCondominio}`);

    return data.map((item) => ({
      id: item.idCuota,
      idCondominio: item.idCondominio,
      periodo: item.periodo,
      monto: item.monto,
      fechaLimite: item.fechaLimite,
      recargo: item.recargo,
      status: item.estado,
    }));
  },

  async listAvisos(idCondominio: number) {
    const data = await requestJson<BackendAviso[]>(`/avisos?idCondominio=${idCondominio}`);

    return data.map((item) => ({
      id: item.idAviso,
      idCondominio: item.idCondominio,
      titulo: item.titulo,
      mensaje: item.contenido,
      fecha: formatDateLabel(item.fechaPublicacion),
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin,
    }));
  },

  async createAviso(input: {
    idCondominio: number;
    idUsuarioCondominioAdmin: number;
    titulo: string;
    contenido: string;
  }) {
    const item = await requestJson<BackendAviso>('/avisos', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return {
      id: item.idAviso,
      idCondominio: item.idCondominio,
      titulo: item.titulo,
      mensaje: item.contenido,
      fecha: formatDateLabel(item.fechaPublicacion),
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin,
    };
  },

  async listVotaciones(idCondominio: number) {
    const data = await requestJson<BackendVotacion[]>(`/votaciones?idCondominio=${idCondominio}&estado=ABIERTA`);

    return data.map((item) => ({
      id: item.idVotacion,
      idCondominio: item.idCondominio,
      pregunta: item.pregunta,
      aFavor: item.aFavor,
      enContra: item.enContra,
      votosPorUsuario: {},
    }));
  },

  async createVotacion(input: {
    idCondominio: number;
    idUsuarioCondominioAdmin: number;
    pregunta: string;
  }) {
    const item = await requestJson<BackendVotacion>('/votaciones', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return {
      id: item.idVotacion,
      idCondominio: item.idCondominio,
      pregunta: item.pregunta,
      aFavor: item.aFavor,
      enContra: item.enContra,
      votosPorUsuario: {},
    };
  },

  async votar(input: {
    idCondominio: number;
    idVotacion: number;
    idUsuarioCondominio: number;
    choice: VoteChoice;
  }) {
    const item = await requestJson<BackendVotacion>('/votaciones/votar', {
      method: 'POST',
      body: JSON.stringify({
        idCondominio: input.idCondominio,
        idVotacion: input.idVotacion,
        idUsuarioCondominio: input.idUsuarioCondominio,
        opcion: input.choice === 'favor' ? 'FAVOR' : 'CONTRA',
      }),
    });

    return {
      id: item.idVotacion,
      idCondominio: item.idCondominio,
      pregunta: item.pregunta,
      aFavor: item.aFavor,
      enContra: item.enContra,
      votosPorUsuario: {},
    };
  },

  async cerrarVotacion(input: { idCondominio: number; idVotacion: number }) {
    await requestJson<BackendVotacion>('/votaciones/cerrar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async listPagos(idCondominio: number) {
    const data = await requestJson<BackendPago[]>(`/pagos?idCondominio=${idCondominio}`);

    return data.map((item) => ({
      id: item.idPago,
      idCondominio: item.idCondominio,
      cuotaId: item.idCuota,
      condominio: `Usuario ${item.idUsuarioCondominioPaga}`,
      monto: item.monto,
      fecha: item.fechaPago,
      status: mapPagoStatus(item.estado),
      idUsuarioCondominioPaga: item.idUsuarioCondominioPaga,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    }));
  },

  async capturarPago(input: { idCondominio: number; idCuota: number; idUsuarioCondominioPaga: number }) {
    const item = await requestJson<BackendPago>('/pagos/capturar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    return {
      id: item.idPago,
      idCondominio: item.idCondominio,
      cuotaId: item.idCuota,
      condominio: `Usuario ${item.idUsuarioCondominioPaga}`,
      monto: item.monto,
      fecha: item.fechaPago,
      status: mapPagoStatus(item.estado),
      idUsuarioCondominioPaga: item.idUsuarioCondominioPaga,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    };
  },

  async aprobarPago(input: { idCondominio: number; idPago: number; idUsuarioCondominioAdmin: number }) {
    const item = await requestJson<BackendPago>('/pagos/aprobar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    return {
      id: item.idPago,
      idCondominio: item.idCondominio,
      cuotaId: item.idCuota,
      condominio: `Usuario ${item.idUsuarioCondominioPaga}`,
      monto: item.monto,
      fecha: item.fechaPago,
      status: mapPagoStatus(item.estado),
      idUsuarioCondominioPaga: item.idUsuarioCondominioPaga,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    };
  },

  async rechazarPago(input: {
    idCondominio: number;
    idPago: number;
    idUsuarioCondominioAdmin: number;
    motivoRechazo: string;
  }) {
    const item = await requestJson<BackendPago>('/pagos/rechazar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    return {
      id: item.idPago,
      idCondominio: item.idCondominio,
      cuotaId: item.idCuota,
      condominio: `Usuario ${item.idUsuarioCondominioPaga}`,
      monto: item.monto,
      fecha: item.fechaPago,
      status: mapPagoStatus(item.estado),
      idUsuarioCondominioPaga: item.idUsuarioCondominioPaga,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    };
  },

  async listReportesMantenimiento(idCondominio: number) {
    const data = await requestJson<BackendMantenimiento[]>(`/reportes-mantenimiento?idCondominio=${idCondominio}`);

    return data.map((item) => ({
      id: item.idReporte,
      idCondominio: item.idCondominio,
      unidad: item.unidad,
      descripcion: item.descripcion,
      fecha: formatDateLabel(item.fecha),
      estado: item.estado,
      idUsuarioCondominioReporta: item.idUsuarioCondominioReporta,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    }));
  },

  async createReporteMantenimiento(input: {
    idCondominio: number;
    idUsuarioCondominioReporta: number;
    unidad: string;
    descripcion: string;
  }) {
    const item = await requestJson<BackendMantenimiento>('/reportes-mantenimiento', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return {
      id: item.idReporte,
      idCondominio: item.idCondominio,
      unidad: item.unidad,
      descripcion: item.descripcion,
      fecha: formatDateLabel(item.fecha),
      estado: item.estado,
      idUsuarioCondominioReporta: item.idUsuarioCondominioReporta,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    };
  },

  async updateReporteMantenimientoEstado(input: {
    idCondominio: number;
    idReporte: number;
    idUsuarioCondominioAdmin: number;
    estado: 'NUEVO' | 'EN_PROCESO' | 'RESUELTO';
  }) {
    const item = await requestJson<BackendMantenimiento>('/reportes-mantenimiento/estado', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });

    return {
      id: item.idReporte,
      idCondominio: item.idCondominio,
      unidad: item.unidad,
      descripcion: item.descripcion,
      fecha: formatDateLabel(item.fecha),
      estado: item.estado,
      idUsuarioCondominioReporta: item.idUsuarioCondominioReporta,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    };
  },

  async listGastos(idCondominio: number) {
    const data = await requestJson<BackendGasto[]>(`/gastos?idCondominio=${idCondominio}`);

    return data.map((item) => ({
      id: item.idGasto,
      idCondominio: item.idCondominio,
      concepto: item.concepto,
      categoria: item.categoria,
      monto: item.monto,
      fecha: item.fecha.slice(0, 10),
    }));
  },

  async createGasto(input: { idCondominio: number; concepto: string; categoria: string; monto: number }) {
    const item = await requestJson<BackendGasto>('/gastos', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return {
      id: item.idGasto,
      idCondominio: item.idCondominio,
      concepto: item.concepto,
      categoria: item.categoria,
      monto: item.monto,
      fecha: item.fecha.slice(0, 10),
    };
  },

  async listReportesFinancieros(idCondominio: number) {
    return requestJson<BackendReporteFinanciero[]>(`/reportes-financieros?idCondominio=${idCondominio}`);
  },
};