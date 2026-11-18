import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const TIPOS = [
  'RECORDATORIO_ANTES_VENCIMIENTO',
  'RECORDATORIO_DESPUES_VENCIMIENTO',
  'SOLICITUD_CAMBIO_CREADA',
  'SOLICITUD_CAMBIO_APROBADA',
  'SOLICITUD_CAMBIO_RECHAZADA',
  'SOLICITUD_CAMBIO_EJECUTADA',
  'ALTA_INICIAL_USUARIO',
  'SOLICITUD_ALTA_CREADA',
  'SOLICITUD_ALTA_VERIFICADA',
  'SOLICITUD_ALTA_APROBADA',
  'SOLICITUD_ALTA_RECHAZADA',
  'SUSCRIPCION_PENDIENTE',
  'SUSCRIPCION_ACTIVA',
  'INVITACION_AGOTADA',
  'VOTACION_ROL_CREADA',
  'VOTACION_ROL_RESUELTA',
  'ROL_CAMBIADO',
  'SUSCRIPCION_PAGO_FALLIDO',
  'SUSCRIPCION_SUSPENDIDA',
  'DATOS_FISCALES_PENDIENTES',
  'CARGO_CUOTA_CREADO',
  'PAGO_EN_LINEA_CONFIRMADO',
  'CARGO_CUOTA_EXPIRADO',
  'CUENTA_COBRO_CONFIGURADA',
  'AVISO_PUBLICADO',
  'PAGO_RECHAZADO',
] as const;

/**
 * Canales solicitados. Cualquier campo omitido toma el valor de la
 * configuracion del usuario; un valor explicito la sobrescribe.
 */
export class CanalesNotificacionDto {
  @IsOptional()
  @IsBoolean()
  interna?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class CreateNotificacionDto {
  @IsInt()
  @Min(1)
  idCondominio!: number;

  @IsInt()
  @Min(1)
  idUsuarioCondominio!: number;

  @IsString()
  @IsIn(TIPOS)
  tipo!: (typeof TIPOS)[number];

  @IsString()
  @MinLength(3)
  asunto!: string;

  @IsString()
  @MinLength(5)
  mensaje!: string;

  /** Si se omite, se envia de inmediato. */
  @IsOptional()
  @IsISO8601()
  fechaProgramada?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CanalesNotificacionDto)
  canales?: CanalesNotificacionDto;
}

/**
 * Marcar como leida.
 *
 * No lleva `idUsuarioCondominio`: se toma del JWT. Antes lo recibia del cuerpo,
 * lo que permitia marcar como leida la notificacion de otra persona.
 */
export class MarcarNotificacionLeidaDto {
  @IsInt()
  @Min(1)
  idNotificacion!: number;
}

export class ListarNotificacionesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  // `@Type(() => Boolean)` no sirve aqui: `Boolean('false')` es `true`, asi que
  // `?soloNoLeidas=false` se interpretaria como true.
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  soloNoLeidas?: boolean;
}

export class PushSuscripcionKeysDto {
  @IsString()
  @MinLength(10)
  p256dh!: string;

  @IsString()
  @MinLength(5)
  auth!: string;
}

export class PushSuscripcionDto {
  @IsString()
  @MinLength(20)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSuscripcionKeysDto)
  keys!: PushSuscripcionKeysDto;
}

export class PushDesuscripcionDto {
  @IsString()
  @MinLength(20)
  endpoint!: string;
}
