import type { NavItem } from '../types/app';

export const navCondomino: NavItem[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home' },
  { key: 'pagos', label: 'Pagos', icon: 'payments' },
  { key: 'perfil', label: 'Datos personales', icon: 'users' },
  { key: 'avisos', label: 'Avisos', icon: 'megaphone' },
  { key: 'votaciones', label: 'Votaciones', icon: 'vote' },
  { key: 'mantenimiento', label: 'Mantenimiento', icon: 'tools' },
  { key: 'reportes', label: 'Reportes', icon: 'report' },
];

export const navAdministrador: NavItem[] = [
  { key: 'inicio', label: 'Panel admin', icon: 'users' },
  { key: 'validaciones', label: 'Validar pagos', icon: 'approve' },
  // El administrador que tambien vive en el condominio necesita ver sus
  // propias cuotas. `App` la oculta cuando no tiene una unidad ocupada.
  { key: 'pagos', label: 'Mis pagos', icon: 'payments' },
  { key: 'invitaciones', label: 'Invitaciones', icon: 'link' },
  { key: 'nuevo-condominio', label: 'Crear condominio', icon: 'home' },
  { key: 'perfil', label: 'Datos personales', icon: 'users' },
  { key: 'solicitudes', label: 'Altas, bajas y cambios', icon: 'tools' },
  { key: 'avisos', label: 'Avisos', icon: 'megaphone' },
  { key: 'votaciones', label: 'Votaciones', icon: 'vote' },
  { key: 'mantenimiento', label: 'Mantenimiento', icon: 'tools' },
  { key: 'finanzas', label: 'Gastos y reportes', icon: 'money' },
  { key: 'suscripcion', label: 'Suscripción y cobro', icon: 'card' },
];
