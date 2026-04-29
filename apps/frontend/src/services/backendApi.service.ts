import type { PagoStatus, UnidadConOcupante, VoteChoice } from '../types/app';

let authToken: string | null = null;

type BackendCuota = {
  idCuota: number;
  idCondominio: number;
  periodo: string;
  tipo: string;
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
  tipo?: 'GENERAL' | 'CAMBIO_CUOTA';
  estado: 'ABIERTA' | 'CERRADA';
  fechaInicio: string;
  fechaFin: string;
  aFavor: number;
  enContra: number;
  totalVotos: number;
  cambioCuota?: {
    montoPropuesto: number;
    recargoPropuesto: number;
    diaLimitePropuesto: number;
    periodoAplicacion: string;
    estadoPropuesta: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EJECUTADA';
    motivo: string | null;
    ejecutable: boolean;
  } | null;
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
  claveUnidad: string | null;
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

type BackendFotoMantenimiento = {
  idFoto: number;
  idReporte: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
  tipo: 'REPORTE' | 'RESOLUCION';
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

type BackendLoginMembership = {
  idUsuarioCondominio: number;
  idCondominio: number;
  rol: 'CONDOMINO' | 'ADMINISTRADOR';
  estado: 'ACTIVO' | 'INACTIVO' | string;
};

type BackendLoginUser = {
  idUsuario: number;
  nombre: string;
  correo: string;
  role: 'condomino' | 'administrador' | 'superusuario';
  requiereCambioPassword: boolean;
  membresias: BackendLoginMembership[];
};

type BackendLoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: BackendLoginUser;
};

type BackendEvidenciaPago = {
  idEvidencia: number;
  idPago: number;
  idCondominio: number;
  nombreArchivo: string;
  urlArchivo: string;
  fechaCarga: string;
};

type BackendRecibo = {
  idRecibo: number;
  idPago: number;
  idCondominio: number;
  folio: string;
  fechaGeneracion: string;
  urlPdf: string;
};

type BackendConfigNotificaciones = {
  idConfig: number;
  idUsuarioCondominio: number;
  idCondominio: number;
  diasAntes: number;
  diasDespues: number;
  usarEmail: boolean;
  usarInterna: boolean;
  activo: boolean;
};

type BackendNotificacion = {
  idNotificacion: number;
  idCondominio: number;
  idUsuarioCondominio: number;
  tipo: string;
  canal: string;
  asunto: string;
  mensaje: string;
  fechaProgramada: string;
  fechaEnvio: string | null;
  estado: string;
  idConfig: number | null;
};

type BackendSolicitudCambio = {
  idSolicitud: number;
  idCondominio: number;
  idUsuarioCondominioSolicitante: number;
  idUsuarioCondominioObjetivo: number;
  tipo: 'BAJA_CONDOMINO' | 'CAMBIO_UNIDAD' | 'CAMBIO_OCUPACION' | string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EJECUTADA' | string;
  motivo: string;
  detalle: Record<string, unknown> | null;
  comentarioResolucion: string | null;
  fechaSolicitud: string;
  fechaResolucion: string | null;
  fechaEjecucion: string | null;
};

function getApiBaseUrl() {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (raw && raw.length > 0) {
    return raw.endsWith('/api') ? raw : `${raw}/api`;
  }
  return '/api';
}

export function getApiHostUrl() {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (raw && raw.length > 0) {
    return raw.endsWith('/api') ? raw.slice(0, -4) : raw;
  }
  return '';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasFormDataBody = init?.body instanceof FormData;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      ...(hasFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
  setAccessToken(token: string | null) {
    authToken = token;
  },

  async login(correo: string, password: string): Promise<BackendLoginResponse> {
    const response = await requestJson<BackendLoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, password }),
    });

    this.setAccessToken(response.accessToken);
    return response;
  },

  async updatePerfilCorreo(correo: string) {
    return requestJson<{ idUsuario: number; correo: string }>('/auth/perfil', {
      method: 'PATCH',
      body: JSON.stringify({ correo }),
    });
  },

  async changePassword(passwordActual: string, passwordNueva: string) {
    return requestJson<{ ok: boolean; message: string }>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ passwordActual, passwordNueva }),
    });
  },

  async listCuotas(idCondominio: number) {
    const data = await requestJson<BackendCuota[]>(`/cuotas?idCondominio=${idCondominio}`);

    return data.map((item) => ({
      id: item.idCuota,
      idCondominio: item.idCondominio,
      periodo: item.periodo,
      tipo: item.tipo ?? 'Cuota de mantenimiento',
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
      tipo: item.tipo ?? 'GENERAL',
      cambioCuota: item.cambioCuota ?? null,
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
      tipo: item.tipo ?? 'GENERAL',
      cambioCuota: item.cambioCuota ?? null,
      aFavor: item.aFavor,
      enContra: item.enContra,
      votosPorUsuario: {},
    };
  },

  async createVotacionCambioCuota(input: {
    idCondominio: number;
    idUsuarioCondominioAdmin: number;
    montoPropuesto: number;
    recargoPropuesto?: number;
    diaLimitePropuesto?: number;
    motivo?: string;
  }) {
    const item = await requestJson<BackendVotacion>('/votaciones/cambio-cuota', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return {
      id: item.idVotacion,
      idCondominio: item.idCondominio,
      pregunta: item.pregunta,
      tipo: item.tipo ?? 'CAMBIO_CUOTA',
      cambioCuota: item.cambioCuota ?? null,
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
      tipo: item.tipo ?? 'GENERAL',
      cambioCuota: item.cambioCuota ?? null,
      aFavor: item.aFavor,
      enContra: item.enContra,
      votosPorUsuario: {},
    };
  },

  async cerrarVotacion(input: { idCondominio: number; idVotacion: number }) {
    return requestJson<BackendVotacion>('/votaciones/cerrar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async listCambiosCuota(idCondominio: number) {
    const data = await requestJson<BackendVotacion[]>(`/votaciones/cambios-cuota?idCondominio=${idCondominio}`);
    return data.map((item) => ({
      id: item.idVotacion,
      idCondominio: item.idCondominio,
      pregunta: item.pregunta,
      tipo: item.tipo ?? 'CAMBIO_CUOTA',
      cambioCuota: item.cambioCuota ?? null,
      aFavor: item.aFavor,
      enContra: item.enContra,
      votosPorUsuario: {},
    }));
  },

  async ejecutarCambioCuota(input: {
    idCondominio: number;
    idVotacion: number;
    idUsuarioCondominioAdmin: number;
  }) {
    return requestJson<BackendVotacion>('/votaciones/cambio-cuota/ejecutar', {
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
      condominio: item.claveUnidad ?? `Unidad ${item.idUsuarioCondominioPaga}`,
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
      condominio: item.claveUnidad ?? `Unidad ${item.idUsuarioCondominioPaga}`,
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
      condominio: item.claveUnidad ?? `Unidad ${item.idUsuarioCondominioPaga}`,
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
      condominio: item.claveUnidad ?? `Unidad ${item.idUsuarioCondominioPaga}`,
      monto: item.monto,
      fecha: item.fechaPago,
      status: mapPagoStatus(item.estado),
      idUsuarioCondominioPaga: item.idUsuarioCondominioPaga,
      idUsuarioCondominioAdmin: item.idUsuarioCondominioAdmin ?? undefined,
    };
  },

  async listReportesMantenimiento(idCondominio: number) {
    const data = await requestJson<BackendMantenimiento[]>(`/reportes-mantenimiento?idCondominio=${idCondominio}`);

    return data
      .filter((item) => Number(item.idReporte) > 0)
      .map((item) => ({
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

  async createFotoMantenimiento(input: {
    idCondominio: number;
    idReporte: number;
    tipo: 'REPORTE' | 'RESOLUCION';
    archivo: File;
    nombreArchivo?: string;
  }) {
    const body = new FormData();
    body.append('idCondominio', String(input.idCondominio));
    body.append('idReporte', String(input.idReporte));
    body.append('tipo', input.tipo);
    body.append('nombreArchivo', input.nombreArchivo ?? input.archivo.name);
    body.append('archivo', input.archivo);

    return requestJson<BackendFotoMantenimiento>('/fotos-mantenimiento', {
      method: 'POST',
      body,
    });
  },

  async listFotosMantenimiento(input: { idCondominio: number; idReporte?: number }) {
    const params = new URLSearchParams({ idCondominio: String(input.idCondominio) });
    if (input.idReporte) {
      params.set('idReporte', String(input.idReporte));
    }

    return requestJson<BackendFotoMantenimiento[]>(`/fotos-mantenimiento?${params.toString()}`);
  },

  async deleteFotoMantenimiento(input: { idCondominio: number; idFoto: number }) {
    return requestJson<{ ok: boolean }>(
      `/fotos-mantenimiento/${input.idFoto}?idCondominio=${input.idCondominio}`,
      { method: 'DELETE' },
    );
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

  async createEvidenciaPago(input: {
    idCondominio: number;
    idPago: number;
    archivo: File;
    nombreArchivo?: string;
  }) {
    const body = new FormData();
    body.append('idCondominio', String(input.idCondominio));
    body.append('idPago', String(input.idPago));
    body.append('nombreArchivo', input.nombreArchivo ?? input.archivo.name);
    body.append('archivo', input.archivo);

    return requestJson<BackendEvidenciaPago>('/evidencias-pago', {
      method: 'POST',
      body,
    });
  },

  async listEvidenciasPago(input: { idCondominio: number; idPago?: number }) {
    const params = new URLSearchParams({ idCondominio: String(input.idCondominio) });
    if (input.idPago) {
      params.set('idPago', String(input.idPago));
    }

    return requestJson<BackendEvidenciaPago[]>(`/evidencias-pago?${params.toString()}`);
  },

  async deleteEvidenciaPago(input: { idCondominio: number; idEvidencia: number }) {
    return requestJson<{ ok: boolean }>(
      `/evidencias-pago/${input.idEvidencia}?idCondominio=${input.idCondominio}`,
      { method: 'DELETE' },
    );
  },

  async generarRecibo(input: { idCondominio: number; idPago: number }) {
    return requestJson<BackendRecibo>('/recibos/generar', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listRecibos(input: { idCondominio: number; idPago?: number }) {
    const params = new URLSearchParams({ idCondominio: String(input.idCondominio) });
    if (input.idPago) {
      params.set('idPago', String(input.idPago));
    }
    return requestJson<BackendRecibo[]>(`/recibos?${params.toString()}`);
  },

  async getConfigNotificaciones(input: { idCondominio: number; idUsuarioCondominio: number }) {
    const params = new URLSearchParams({
      idCondominio: String(input.idCondominio),
      idUsuarioCondominio: String(input.idUsuarioCondominio),
    });
    return requestJson<BackendConfigNotificaciones>(`/config-notificaciones?${params.toString()}`);
  },

  async upsertConfigNotificaciones(input: {
    idCondominio: number;
    idUsuarioCondominio: number;
    diasAntes: number;
    diasDespues: number;
    usarEmail: boolean;
    usarInterna: boolean;
    activo: boolean;
  }) {
    return requestJson<BackendConfigNotificaciones>('/config-notificaciones/guardar', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listNotificaciones(input: { idCondominio: number; idUsuarioCondominio: number; estado?: string }) {
    const params = new URLSearchParams({
      idCondominio: String(input.idCondominio),
      idUsuarioCondominio: String(input.idUsuarioCondominio),
    });
    if (input.estado) {
      params.set('estado', input.estado);
    }
    return requestJson<BackendNotificacion[]>(`/notificaciones?${params.toString()}`);
  },

  async marcarNotificacionLeida(input: { idCondominio: number; idNotificacion: number }) {
    return requestJson<BackendNotificacion>('/notificaciones/leer', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async createOnboardingInicial(input: {
    nombreCondominio: string;
    direccionCondominio?: string;
    nombreAdmin: string;
    apellidoPaternoAdmin: string;
    apellidoMaternoAdmin?: string;
    correoAdmin: string;
    nombreCondomino: string;
    apellidoPaternoCondomino: string;
    apellidoMaternoCondomino?: string;
    correoCondomino: string;
    claveUnidadCondomino: string;
    tipoUnidadCondomino: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
    admins?: Array<{
      nombre: string;
      apellidoPaterno: string;
      apellidoMaterno?: string;
      correo: string;
    }>;
    condominos?: Array<{
      nombre: string;
      apellidoPaterno: string;
      apellidoMaterno?: string;
      correo: string;
      claveUnidad: string;
      tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
    }>;
    idUnidadExistenteCondomino?: number;
    montoCuotaInicial: number;
    diaLimitePago: number;
    recargoFijoPorDia: number;
    periodoAplicacionInicial: string;
    fechaInicioCobro: string;
    unidades: Array<{
      claveUnidad: string;
      tipoUnidad: 'CASA' | 'DEPARTAMENTO' | 'LOCAL' | 'OTRO';
    }>;
  }) {
    return requestJson<{
      idCondominio: number;
      idUsuarioAdmin: number;
      idUsuarioCondomino: number;
      idUsuarioCondominioAdmin: number;
      idUsuarioCondominioCondomino: number;
      passwordTemporalAdmin: string | null;
      passwordTemporalCondomino: string | null;
      adminsCreados: Array<{
        idUsuario: number;
        idUsuarioCondominio: number;
        correo: string;
        passwordTemporal: string | null;
        reutilizado: boolean;
      }>;
      condominosCreados: Array<{
        idUsuario: number;
        idUsuarioCondominio: number;
        correo: string;
        passwordTemporal: string | null;
        reutilizado: boolean;
      }>;
      unidadesCreadas: number;
      ocupacionesCreadas: number;
      cuotasInicialesCreadas: number;
      cuotaInicial: {
        montoCuotaInicial: number;
        diaLimitePago: number;
        recargoFijoPorDia: number;
        periodoAplicacionInicial: string;
        fechaInicioCobro: string;
      };
      advertenciaCuotas?: string;
    }>('/usuarios/onboarding-inicial', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listSuperCondominios() {
    return requestJson<
      Array<{
        idCondominio: number;
        nombre: string;
        direccion: string | null;
        estado: 'ACTIVO' | 'INACTIVO';
        fechaAlta: string;
        totalAdmins: number;
        totalCondominos: number;
        totalUsuarios: number;
      }>
    >('/usuarios/super/condominios');
  },

  async updateSuperCondominioEstado(input: { idCondominio: number; estado: 'ACTIVO' | 'INACTIVO' }) {
    return requestJson<{
      idCondominio: number;
      nombre: string;
      direccion: string | null;
      estado: 'ACTIVO' | 'INACTIVO';
      fechaAlta: string;
      totalAdmins: number;
      totalCondominos: number;
      totalUsuarios: number;
    }>(`/usuarios/super/condominios/${input.idCondominio}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: input.estado }),
    });
  },

  async createSolicitudCambio(input: {
    idCondominio: number;
    idUsuarioCondominioSolicitante: number;
    idUsuarioCondominioObjetivo: number;
    tipo: 'BAJA_CONDOMINO' | 'CAMBIO_UNIDAD' | 'CAMBIO_OCUPACION';
    motivo: string;
    detalle?: Record<string, unknown>;
  }) {
    return requestJson<BackendSolicitudCambio>('/condominos/solicitudes-cambio', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async listSolicitudesCambio(input: { idCondominio: number; estado?: string }) {
    const params = new URLSearchParams({
      idCondominio: String(input.idCondominio),
    });
    if (input.estado) {
      params.set('estado', input.estado);
    }
    return requestJson<BackendSolicitudCambio[]>(`/condominos/solicitudes-cambio?${params.toString()}`);
  },

  async aprobarSolicitudCambio(input: {
    idCondominio: number;
    idSolicitud: number;
    idUsuarioCondominioAdmin: number;
    comentario?: string;
  }) {
    return requestJson<BackendSolicitudCambio>('/condominos/solicitudes-cambio/aprobar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async rechazarSolicitudCambio(input: {
    idCondominio: number;
    idSolicitud: number;
    idUsuarioCondominioAdmin: number;
    comentario?: string;
  }) {
    return requestJson<BackendSolicitudCambio>('/condominos/solicitudes-cambio/rechazar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async ejecutarSolicitudCambio(input: {
    idCondominio: number;
    idSolicitud: number;
    idUsuarioCondominioAdmin: number;
    comentario?: string;
  }) {
    return requestJson<BackendSolicitudCambio>('/condominos/solicitudes-cambio/ejecutar', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  async listUnidadesDisponibles(input: { idCondominio: number }) {
    const params = new URLSearchParams({
      idCondominio: String(input.idCondominio),
    });
    return requestJson<
      Array<{
        idUnidad: number;
        claveUnidad: string;
        tipoUnidad: string;
      }>
    >(`/condominos/unidades-disponibles?${params.toString()}`);
  },

  async listUnidadesConOcupantes(input: { idCondominio: number }) {
    const params = new URLSearchParams({
      idCondominio: String(input.idCondominio),
    });
    return requestJson<UnidadConOcupante[]>(`/condominos/unidades?${params.toString()}`);
  },

  async createAltaCondominoAdmin(input: {
    idCondominio: number;
    idUsuarioCondominioAdmin: number;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno?: string;
    correo: string;
    idUnidad: number;
    tipoOcupacion?: 'PROPIETARIO' | 'INQUILINO' | 'HABITANTE';
  }) {
    return requestJson<{
      idUsuario: number;
      idUsuarioCondominio: number;
      idUnidad: number;
      correo: string;
      passwordTemporal: string | null;
      reutilizado: boolean;
    }>('/condominos/altas', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};