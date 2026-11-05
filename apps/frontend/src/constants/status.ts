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

/**
 * Estado del condominio en el ciclo de registro/suscripcion.
 *
 * Nunca mostrar el valor crudo (`PENDIENTE_PAGO`) en la interfaz: al usuario no
 * le dice nada y parece un error del sistema.
 */
export const estadoCondominioLabel: Record<string, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  SUSPENDIDO: 'Suspendido',
  PENDIENTE_VERIFICACION: 'Correo sin verificar',
  PENDIENTE_PAGO: 'Pago de suscripcion pendiente',
};

/** Explicacion de que implica cada estado, para mostrar junto a la etiqueta. */
export const estadoCondominioDetalle: Record<string, string> = {
  ACTIVO: 'El condominio esta operando con normalidad.',
  INACTIVO: 'El condominio fue desactivado por la administracion de la plataforma.',
  SUSPENDIDO: 'El condominio esta suspendido: no se pueden procesar altas ni invitaciones.',
  PENDIENTE_VERIFICACION: 'Falta confirmar el correo del administrador.',
  PENDIENTE_PAGO:
    'El condominio ya existe y tiene sus unidades, pero falta confirmar el pago de la suscripcion para poder invitar condominos.',
};

export function etiquetaEstadoCondominio(estado: string): string {
  return estadoCondominioLabel[estado] ?? estado;
}

/** Chip de color reutilizando los estilos existentes. */
export function claseEstadoCondominio(estado: string): string {
  switch (estado) {
    case 'ACTIVO':
      return 'status-pagada';
    case 'PENDIENTE_PAGO':
    case 'PENDIENTE_VERIFICACION':
      return 'status-pendiente';
    default:
      return 'status-rechazado';
  }
}
