import { Controller, Get, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CSRF_COOKIE } from '../auth/session-cookies';
import { CsrfService } from './csrf.service';

@Controller('auth')
export class CsrfController {
  constructor(private readonly csrfService: CsrfService) {}

  /**
   * Token CSRF de doble envio.
   *
   * Es idempotente: si el cliente ya trae una cookie valida se reutiliza tal
   * cual. Antes se emitia uno nuevo en cada llamada, y dos peticiones
   * simultaneas al arrancar (refresh de sesion + montaje del login) dejaban el
   * estado de React con un token distinto al de la cookie -> 403 falso.
   */
  @Get('csrf')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const actual = req.cookies?.[CSRF_COOKIE];
    const token = this.csrfService.esValido(actual) ? actual : this.csrfService.emitir(res);
    return { csrfToken: token };
  }
}
