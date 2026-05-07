import type { AppData } from '../types/app';

export const STORAGE_KEY = 'elyx-app-data-v1';

export const seedData = (): AppData => ({
  condominios: [],
  users: [
    {
      idUsuario: 1,
      correo: 'condomino@elyx.mx',
      password: 'Elyx123',
      role: 'condomino',
      nombre: 'Condomino Torre Norte',
      membresias: [
        { idUsuarioCondominio: 1001, idCondominio: 101, rol: 'condomino', estado: 'ACTIVO' },
        { idUsuarioCondominio: 1002, idCondominio: 202, rol: 'condomino', estado: 'ACTIVO' },
      ],
    },
    {
      idUsuario: 2,
      correo: 'admin@elyx.mx',
      password: 'Elyx123',
      role: 'administrador',
      nombre: 'Administrador General',
      membresias: [
        { idUsuarioCondominio: 2001, idCondominio: 101, rol: 'administrador', estado: 'ACTIVO' },
        { idUsuarioCondominio: 2002, idCondominio: 202, rol: 'administrador', estado: 'ACTIVO' },
      ],
    },
  ],
  cuotas: [
    { id: 1, idCondominio: 101, periodo: 'Marzo 2026', tipo: 'Cuota de mantenimiento', monto: 1850, fechaLimite: '2026-03-20', recargo: 50, status: 'PENDIENTE' },
    { id: 2, idCondominio: 101, periodo: 'Abril 2026', tipo: 'Cuota de mantenimiento', monto: 1850, fechaLimite: '2026-04-20', recargo: 0, status: 'PENDIENTE' },
    { id: 3, idCondominio: 202, periodo: 'Marzo 2026', tipo: 'Cuota de mantenimiento', monto: 1650, fechaLimite: '2026-03-21', recargo: 30, status: 'PENDIENTE' },
    { id: 4, idCondominio: 202, periodo: 'Abril 2026', tipo: 'Cuota de mantenimiento', monto: 1650, fechaLimite: '2026-04-21', recargo: 0, status: 'PENDIENTE' },
  ],
  pagos: [
    {
      id: 2421,
      idCondominio: 101,
      cuotaId: 1,
      condominio: 'Depto A-302',
      monto: 1850,
      fecha: '2026-03-16',
      status: 'PENDIENTE',
      idUsuarioCondominioPaga: 1001,
    },
    {
      id: 2422,
      idCondominio: 202,
      cuotaId: 3,
      condominio: 'Depto B-204',
      monto: 1650,
      fecha: '2026-03-17',
      status: 'PENDIENTE',
      idUsuarioCondominioPaga: 1002,
    },
  ],
  avisos: [
    {
      id: 1,
      idCondominio: 101,
      titulo: 'Mantenimiento de cisterna',
      mensaje: 'Habra suspension de agua de 10:00 a 12:00.',
      fecha: '13 Mar 2026',
      idUsuarioCondominioAdmin: 2001,
    },
    {
      id: 2,
      idCondominio: 202,
      titulo: 'Asamblea extraordinaria',
      mensaje: 'Reunion en salon comun el sabado a las 18:00.',
      fecha: '18 Mar 2026',
      idUsuarioCondominioAdmin: 2002,
    },
  ],
  votacionesActivas: [
    {
      id: 1,
      idCondominio: 101,
      pregunta: 'Aprobar presupuesto de jardineria trimestral',
      aFavor: 12,
      enContra: 3,
      votosPorUsuario: {},
    },
    {
      id: 2,
      idCondominio: 202,
      pregunta: 'Renovacion de luminarias en areas comunes',
      aFavor: 8,
      enContra: 2,
      votosPorUsuario: {},
    },
  ],
  mantenimientos: [
    {
      id: 90,
      idCondominio: 101,
      unidad: 'Pasillo B',
      descripcion: 'Fuga en pasillo del edificio B',
      fecha: '16 Mar 2026',
      estado: 'EN_PROCESO',
      idUsuarioCondominioReporta: 1001,
    },
    {
      id: 91,
      idCondominio: 202,
      unidad: 'Lobby Torre 2',
      descripcion: 'Puerta automatica con falla intermitente',
      fecha: '17 Mar 2026',
      estado: 'NUEVO',
      idUsuarioCondominioReporta: 1002,
    },
  ],
  gastos: [
    { id: 1, idCondominio: 101, concepto: 'Jardineria', categoria: 'Servicios', monto: 5400, fecha: '2026-03-08' },
    { id: 2, idCondominio: 101, concepto: 'Mantenimiento elevador', categoria: 'Mantenimiento', monto: 9100, fecha: '2026-03-11' },
    { id: 3, idCondominio: 202, concepto: 'Limpieza de alberca', categoria: 'Servicios', monto: 4700, fecha: '2026-03-10' },
  ],
  reportes: [
    { idCondominio: 101, periodo: 'Enero 2026', ingresos: 92500, gastos: 23300, adeudos: 10400 },
    { idCondominio: 101, periodo: 'Febrero 2026', ingresos: 91150, gastos: 27500, adeudos: 12200 },
    { idCondominio: 202, periodo: 'Enero 2026', ingresos: 68100, gastos: 20100, adeudos: 8600 },
    { idCondominio: 202, periodo: 'Febrero 2026', ingresos: 70400, gastos: 21950, adeudos: 9100 },
  ],
  nextIds: {
    pago: 2500,
    aviso: 3,
    votacion: 3,
    mantenimiento: 100,
    gasto: 3,
  },
});

export function loadAppData(): AppData {
  if (typeof window === 'undefined') {
    return seedData();
  }

  const rawData = window.localStorage.getItem(STORAGE_KEY);
  if (!rawData) {
    return seedData();
  }

  try {
    const parsedData = JSON.parse(rawData) as AppData;
    if (!parsedData.users || !parsedData.condominios || !parsedData.cuotas || !parsedData.pagos || !parsedData.nextIds) {
      return seedData();
    }
    if (typeof parsedData.nextIds.votacion !== 'number') {
      const maxId = parsedData.votacionesActivas?.reduce((acc, item) => Math.max(acc, item.id), 0) ?? 0;
      parsedData.nextIds.votacion = maxId + 1;
    }
    return parsedData;
  } catch {
    return seedData();
  }
}

export function persistAppData(data: AppData) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function formatShortDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
