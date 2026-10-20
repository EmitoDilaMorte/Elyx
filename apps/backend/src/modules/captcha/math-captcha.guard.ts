import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaptchaService } from './captcha.service';
import { MATH_CAPTCHA_KEY, MathCaptchaMode } from './math-captcha.decorator';

@Injectable()
export class MathCaptchaGuard implements CanActivate {
  constructor(
    private readonly captchaService: CaptchaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.CAPTCHA_MATH_ENABLED === 'false') {
      return true;
    }

    const modo = this.reflector.getAllAndOverride<MathCaptchaMode>(MATH_CAPTCHA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!modo) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ body?: Record<string, unknown> }>();
    const body = request.body ?? {};
    const challengeId = typeof body.mathChallengeId === 'string' ? body.mathChallengeId : '';
    const respuesta = typeof body.mathAnswer === 'string' ? body.mathAnswer : '';
    const correo = typeof body.correo === 'string' ? body.correo : '';

    const forzadoPorEntorno = process.env.CAPTCHA_MATH_ENFORCE === 'always';
    let requerido = forzadoPorEntorno || modo === 'always';

    if (!requerido && modo === 'after_failures' && correo.trim().length > 0) {
      const fallos = await this.captchaService.fallosRecientes(correo);
      requerido = fallos >= 3;
    }

    if (!requerido && challengeId.length === 0) {
      return true;
    }

    if (!challengeId || !respuesta) {
      throw new BadRequestException('Verificacion matematica requerida.');
    }

    await this.captchaService.verificar(challengeId, respuesta);
    return true;
  }
}
