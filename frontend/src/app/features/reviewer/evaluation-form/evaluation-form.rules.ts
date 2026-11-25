import {
  COMMENT_MAX_LENGTH,
  EvaluationDraft,
  MAX_SCORE,
  MIN_SCORE,
  ReviewerEvaluation,
} from '../../../core/models/reviewer.model';
import {
  JUSTIFICATION_MIN_LENGTH,
  JUSTIFICATION_SCORE_THRESHOLD,
  RUBRIC_KEYS,
  Recommendation,
  RubricKey,
  characterCount,
  requiresJustification,
} from '../../../core/models/rubric.model';

/** Lo que el Revisor escribe; los comentarios son siempre texto (vacío si no hay). */
export interface EvaluationValues extends Record<RubricKey, number | null> {
  recommendation: Recommendation | null;
  comments_for_author: string;
}

/** Campos que pueden fallar al enviar (los mismos que el servidor exige). */
export type EvaluationField = RubricKey | 'recommendation' | 'comments_for_author';

export type EvaluationErrors = Partial<Record<EvaluationField | 'declaration', string>>;

export const EMPTY_VALUES: EvaluationValues = {
  scientific_contribution: null,
  methodological_rigor: null,
  literature_grounding: null,
  results_conclusions: null,
  academic_writing: null,
  recommendation: null,
  comments_for_author: '',
};

/** Valores del formulario a partir de la evaluación del servidor. */
export function toValues(evaluation: ReviewerEvaluation): EvaluationValues {
  return {
    scientific_contribution: evaluation.scientific_contribution,
    methodological_rigor: evaluation.methodological_rigor,
    literature_grounding: evaluation.literature_grounding,
    results_conclusions: evaluation.results_conclusions,
    academic_writing: evaluation.academic_writing,
    recommendation: evaluation.recommendation,
    comments_for_author: evaluation.comments_for_author ?? '',
  };
}

/** Cuerpo del borrador: el texto en blanco equivale a no haber escrito nada. */
export function toDraft(values: EvaluationValues): EvaluationDraft {
  return {
    ...values,
    comments_for_author: values.comments_for_author.trim() || null,
  };
}

/** Hay cambios respecto de lo último guardado (el espacio sobrante no cuenta). */
export function isDirty(current: EvaluationValues, saved: EvaluationValues): boolean {
  const a = toDraft(current);
  const b = toDraft(saved);
  return (Object.keys(a) as (keyof EvaluationDraft)[]).some((key) => a[key] !== b[key]);
}

export const SCORE_REQUIRED = `Seleccione una puntuación del ${MIN_SCORE} al ${MAX_SCORE}.`;
export const RECOMMENDATION_REQUIRED = 'Seleccione un dictamen.';
export const COMMENTS_REQUIRED = 'Escriba los comentarios para el Autor.';
export const COMMENTS_TOO_LONG = `Los comentarios admiten hasta ${COMMENT_MAX_LENGTH} caracteres.`;
export const DECLARATION_REQUIRED =
  'Debe declarar que no tiene conflicto de interés para enviar la evaluación.';

/** FR-019 aplica: algún criterio en 3 o menos, Revisión mayor o Rechazar. */
export function justificationRequired(values: EvaluationValues): boolean {
  return requiresJustification({ scores: values, recommendation: values.recommendation });
}

/** Mensaje de la justificación, con los caracteres que lleva y los que exige (FR-019). */
export function justificationMessage(current: number): string {
  return (
    `Escriba al menos ${JUSTIFICATION_MIN_LENGTH} caracteres: algún criterio es ` +
    `${JUSTIFICATION_SCORE_THRESHOLD} o menos, o el dictamen es Revisión mayor o Rechazar ` +
    `(lleva ${current}).`
  );
}

/**
 * Lo que impide el envío final: los cinco criterios, el dictamen, los comentarios
 * para el Autor (con 100 caracteres cuando FR-019 lo exige) y la declaración de no
 * tener conflicto de interés. El borrador no pasa por aquí: se guarda con huecos.
 */
export function submitErrors(values: EvaluationValues, declared: boolean): EvaluationErrors {
  const errors: EvaluationErrors = {};
  for (const key of RUBRIC_KEYS) {
    const score = values[key];
    if (score === null || score < MIN_SCORE || score > MAX_SCORE) {
      errors[key] = SCORE_REQUIRED;
    }
  }
  if (values.recommendation === null) {
    errors['recommendation'] = RECOMMENDATION_REQUIRED;
  }
  const length = characterCount(values.comments_for_author);
  if (length === 0) {
    errors['comments_for_author'] = COMMENTS_REQUIRED;
  } else if (values.comments_for_author.length > COMMENT_MAX_LENGTH) {
    errors['comments_for_author'] = COMMENTS_TOO_LONG;
  } else if (justificationRequired(values) && length < JUSTIFICATION_MIN_LENGTH) {
    errors['comments_for_author'] = justificationMessage(length);
  }
  if (!declared) {
    errors['declaration'] = DECLARATION_REQUIRED;
  }
  return errors;
}

/** Errores por campo del envelope `details` de un `400` (`{campo: [mensajes]}`). */
export function serverFieldErrors(details: unknown): EvaluationErrors {
  const errors: EvaluationErrors = {};
  if (typeof details !== 'object' || details === null) {
    return errors;
  }
  const known = new Set<string>([...RUBRIC_KEYS, 'recommendation', 'comments_for_author']);
  for (const [field, messages] of Object.entries(details)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (known.has(field) && typeof first === 'string') {
      errors[field as EvaluationField] = first;
    }
  }
  return errors;
}
