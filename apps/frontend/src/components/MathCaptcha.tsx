type MathCaptchaProps = {
  challengeId: string;
  question: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onRefresh: () => void;
};

/**
 * Segundo mecanismo de verificacion propio: una operacion aritmetica de un
 * solo uso. La pregunta se muestra como texto visible para que cualquier
 * analizador (incluido el bot) la reconozca como desafio textual.
 */
export function MathCaptcha({ challengeId, question, value, disabled, onChange, onRefresh }: MathCaptchaProps) {
  return (
    <div
      className="math-captcha"
      id={challengeId ? `captcha-${challengeId}` : undefined}
      data-testid="math-captcha"
    >
      <span className="field-label">Verificacion adicional</span>
      <div className="math-captcha-row">
        <strong className="math-question">{question || 'Cargando verificacion...'}</strong>
        <input
          id="math-answer"
          name="math_answer"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Respuesta a la operacion matematica"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.replace(/[^\d-]/g, '').slice(0, 6))}
        />
        <button className="soft-btn compact-btn" type="button" onClick={onRefresh} disabled={disabled}>
          Otra
        </button>
      </div>
    </div>
  );
}
