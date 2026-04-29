import type { CuotaStatus, MantenimientoStatus, PagoStatus } from '../types/app';

export const statusLabel: Record<CuotaStatus | PagoStatus | MantenimientoStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_VALIDACION: 'En validacion',
  PAGADA: 'Pagada',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  NUEVO: 'Nuevo',
  EN_PROCESO: 'En proceso',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
};
