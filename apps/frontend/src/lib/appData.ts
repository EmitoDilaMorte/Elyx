import type { AppData } from '../types/app';

export const STORAGE_KEY = 'elyx-app-data-v1';

export const seedData = (): AppData => ({
  users: [
    {
      correo: 'condomino@elyx.mx',
      password: 'Elyx123',
      role: 'condomino',
      nombre: 'Condomino Torre Norte',
    },
    {
      correo: 'admin@elyx.mx',
      password: 'Elyx123',
      role: 'administrador',
      nombre: 'Administrador General',
    },
  ],
  cuotas: [
    { id: 1, periodo: 'Marzo 2026', monto: 1850, fechaLimite: '2026-03-20', recargo: 50, status: 'PENDIENTE' },
    { id: 2, periodo: 'Abril 2026', monto: 1850, fechaLimite: '2026-04-20', recargo: 0, status: 'PENDIENTE' },
  ],
  pagos: [
    { id: 2421, cuotaId: 1, condominio: 'Depto A-302', monto: 1850, fecha: '2026-03-16', status: 'PENDIENTE' },
    { id: 2422, cuotaId: 2, condominio: 'Depto C-101', monto: 1850, fecha: '2026-03-16', status: 'PENDIENTE' },
  ],
  avisos: [
    {
      id: 1,
      titulo: 'Mantenimiento de cisterna',
      mensaje: 'Habra suspension de agua de 10:00 a 12:00.',
      fecha: '13 Mar 2026',
    },
    {
      id: 2,
      titulo: 'Asamblea extraordinaria',
      mensaje: 'Reunion en salon comun el sabado a las 18:00.',
      fecha: '18 Mar 2026',
    },
  ],
  votacionActiva: {
    id: 1,
    pregunta: 'Aprobar presupuesto de jardineria trimestral',
    aFavor: 12,
    enContra: 3,
    votosPorUsuario: {},
  },
  mantenimientos: [
    {
      id: 90,
      unidad: 'Pasillo B',
      descripcion: 'Fuga en pasillo del edificio B',
      fecha: '16 Mar 2026',
      estado: 'EN_PROCESO',
    },
  ],
  gastos: [
    { id: 1, concepto: 'Jardineria', categoria: 'Servicios', monto: 5400, fecha: '2026-03-08' },
    { id: 2, concepto: 'Mantenimiento elevador', categoria: 'Mantenimiento', monto: 9100, fecha: '2026-03-11' },
  ],
  reportes: [
    { periodo: 'Enero 2026', ingresos: 92500, gastos: 23300, adeudos: 10400 },
    { periodo: 'Febrero 2026', ingresos: 91150, gastos: 27500, adeudos: 12200 },
  ],
  nextIds: {
    pago: 2500,
    aviso: 3,
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
    if (!parsedData.users || !parsedData.cuotas || !parsedData.pagos || !parsedData.nextIds) {
      return seedData();
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
