import { COMMENT_MAX_LENGTH } from '../../../core/models/reviewer.model';
import {
  COMMENTS_REQUIRED,
  COMMENTS_TOO_LONG,
  DECLARATION_REQUIRED,
  EMPTY_VALUES,
  EvaluationValues,
  RECOMMENDATION_REQUIRED,
  SCORE_REQUIRED,
  isDirty,
  justificationMessage,
  justificationRequired,
  serverFieldErrors,
  submitErrors,
  toDraft,
  toValues,
} from './evaluation-form.rules';
import { buildCompleteEvaluation, buildReviewerEvaluation } from '../testing/reviewer.fixtures';

const complete = (): EvaluationValues => toValues(buildCompleteEvaluation());
const text = (length: number): string => 'a'.repeat(length);

describe('toValues / toDraft', () => {
  it('un borrador vacío del servidor da valores vacíos', () => {
    expect(toValues(buildReviewerEvaluation())).toEqual(EMPTY_VALUES);
  });

  it('el texto en blanco viaja como nulo', () => {
    expect(toDraft({ ...EMPTY_VALUES, comments_for_author: '   ' }).comments_for_author).toBeNull();
  });

  it('el texto se recorta y los puntajes pasan tal cual; ya no hay comentarios confidenciales', () => {
    const draft = toDraft({ ...complete(), comments_for_author: '  Hola  ' });

    expect(draft.comments_for_author).toBe('Hola');
    expect(draft.scientific_contribution).toBe(4);
    expect(draft.recommendation).toBe('MINOR_REVISION');
    expect('confidential_comments' in draft).toBe(false);
  });
});

describe('isDirty', () => {
  it('iguales no son cambios', () => {
    expect(isDirty(complete(), complete())).toBe(false);
  });

  it('el espacio sobrante no cuenta como cambio', () => {
    expect(
      isDirty({ ...complete(), comments_for_author: '  Aclarar la metodología.  ' }, complete()),
    ).toBe(false);
  });

  it('un criterio, el dictamen o el texto distinto sí', () => {
    expect(isDirty({ ...complete(), academic_writing: 2 }, complete())).toBe(true);
    expect(isDirty({ ...complete(), recommendation: 'ACCEPTED' }, complete())).toBe(true);
    expect(isDirty({ ...complete(), comments_for_author: 'otro' }, complete())).toBe(true);
  });
});

describe('justificationRequired (FR-019)', () => {
  it('con todo en 4 o 5 y un dictamen leve no se exige', () => {
    expect(justificationRequired(complete())).toBe(false);
    expect(justificationRequired({ ...complete(), recommendation: 'ACCEPTED' })).toBe(false);
  });

  it.each([1, 2, 3])('un criterio en %i la exige', (score) => {
    expect(justificationRequired({ ...complete(), literature_grounding: score })).toBe(true);
  });

  it.each(['MAJOR_REVISION', 'REJECTED'] as const)('el dictamen %s la exige', (recommendation) => {
    expect(justificationRequired({ ...complete(), recommendation })).toBe(true);
  });

  it('un criterio sin calificar no la exige por sí solo', () => {
    expect(justificationRequired({ ...complete(), methodological_rigor: null })).toBe(false);
  });
});

describe('submitErrors', () => {
  it('una evaluación completa y con la declaración no tiene errores', () => {
    expect(submitErrors(complete(), true)).toEqual({});
  });

  it('exige los cinco criterios, el dictamen, los comentarios y la declaración', () => {
    const errors = submitErrors(EMPTY_VALUES, false);

    expect(Object.keys(errors).sort()).toEqual(
      [
        'academic_writing',
        'comments_for_author',
        'declaration',
        'literature_grounding',
        'methodological_rigor',
        'recommendation',
        'results_conclusions',
        'scientific_contribution',
      ].sort(),
    );
    expect(errors['scientific_contribution']).toBe(SCORE_REQUIRED);
    expect(errors['recommendation']).toBe(RECOMMENDATION_REQUIRED);
    expect(errors['comments_for_author']).toBe(COMMENTS_REQUIRED);
    expect(errors['declaration']).toBe(DECLARATION_REQUIRED);
  });

  it('falta un solo criterio: solo ese campo falla', () => {
    expect(submitErrors({ ...complete(), results_conclusions: null }, true)).toEqual({
      results_conclusions: SCORE_REQUIRED,
    });
  });

  it.each([0, 6, -1])('el puntaje %i fuera de 1–5 no vale', (score) => {
    expect(submitErrors({ ...complete(), academic_writing: score }, true)['academic_writing']).toBe(
      SCORE_REQUIRED,
    );
  });

  it('los comentarios solo con espacios no cuentan', () => {
    expect(submitErrors({ ...complete(), comments_for_author: '   \n ' }, true)).toEqual({
      comments_for_author: COMMENTS_REQUIRED,
    });
  });

  it('los comentarios no pueden superar el máximo', () => {
    expect(
      submitErrors({ ...complete(), comments_for_author: text(COMMENT_MAX_LENGTH + 1) }, true),
    ).toEqual({ comments_for_author: COMMENTS_TOO_LONG });
  });

  it('sin declaración falla aunque todo lo demás esté completo', () => {
    expect(submitErrors(complete(), false)).toEqual({ declaration: DECLARATION_REQUIRED });
  });

  describe('justificación de 100 caracteres', () => {
    const rejected = (comments: string): EvaluationValues => ({
      ...complete(),
      recommendation: 'REJECTED',
      comments_for_author: comments,
    });

    it('con 99 caracteres bloquea y con 100 envía', () => {
      expect(submitErrors(rejected(text(99)), true)).toEqual({
        comments_for_author: justificationMessage(99),
      });
      expect(submitErrors(rejected(text(100)), true)).toEqual({});
    });

    it('no cuenta los espacios al inicio ni al final', () => {
      expect(submitErrors(rejected(`   ${text(99)}   `), true)['comments_for_author']).toBe(
        justificationMessage(99),
      );
      expect(submitErrors(rejected(`  ${text(100)}  `), true)).toEqual({});
    });

    it('cuenta un emoji como un solo carácter', () => {
      expect(submitErrors(rejected('😀'.repeat(99)), true)['comments_for_author']).toBe(
        justificationMessage(99),
      );
      expect(submitErrors(rejected('😀'.repeat(100)), true)).toEqual({});
    });

    it('un criterio en 3 también la exige', () => {
      const values = { ...complete(), literature_grounding: 3, comments_for_author: text(50) };

      expect(submitErrors(values, true)['comments_for_author']).toBe(justificationMessage(50));
    });

    it('con todo alto y un dictamen leve basta un comentario breve', () => {
      expect(submitErrors({ ...complete(), comments_for_author: 'Bien.' }, true)).toEqual({});
    });
  });
});

describe('serverFieldErrors', () => {
  it('toma el primer mensaje de cada campo conocido', () => {
    expect(
      serverFieldErrors({
        literature_grounding: ['Este campo es obligatorio para enviar la evaluación.'],
        comments_for_author: ['Escriba al menos 100 caracteres: …'],
        recommendation: 'Falta.',
      }),
    ).toEqual({
      literature_grounding: 'Este campo es obligatorio para enviar la evaluación.',
      comments_for_author: 'Escriba al menos 100 caracteres: …',
      recommendation: 'Falta.',
    });
  });

  it('ignora campos desconocidos y detalles que no son un objeto', () => {
    expect(serverFieldErrors({ lock_version: 3, status: ['x'] })).toEqual({});
    expect(serverFieldErrors(null)).toEqual({});
    expect(serverFieldErrors('error')).toEqual({});
  });
});
