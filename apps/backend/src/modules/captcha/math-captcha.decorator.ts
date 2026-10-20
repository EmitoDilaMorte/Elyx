import { SetMetadata } from '@nestjs/common';

export const MATH_CAPTCHA_KEY = 'mathCaptchaMode';

export type MathCaptchaMode = 'always' | 'after_failures';

/**
 * Exige la operacion matematica propia.
 *
 * - `always`: siempre (recuperacion de contraseña).
 * - `after_failures`: solo cuando la cuenta acumula 3 o mas fallos recientes
 *   (login), de modo que un acceso legitimo no paga el coste del segundo
 *   desafio pero la fuerza bruta si.
 */
export const MathCaptcha = (mode: MathCaptchaMode) => SetMetadata(MATH_CAPTCHA_KEY, mode);
