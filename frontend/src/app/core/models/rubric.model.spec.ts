import {
  JUSTIFICATION_MIN_LENGTH,
  LEGACY_SCORE_CRITERIA,
  RECOMMENDATION_LABELS,
  RECOMMENDATION_OPTIONS,
  RUBRIC_CRITERIA,
  RUBRIC_KEYS,
  characterCount,
  requiresJustification,
} from './rubric.model';

describe('rúbrica de cinco criterios', () => {
  it('tiene los cinco criterios en el orden de FR-016', () => {
    expect(RUBRIC_KEYS).toEqual([
      'scientific_contribution',
      'methodological_rigor',
      'literature_grounding',
      'results_conclusions',
      'academic_writing',
    ]);
    expect(RUBRIC_CRITERIA.map((c) => c.name)).toEqual([
      'Pertinencia y Contribución Científica',
      'Rigor Metodológico y Reproducibilidad',
      'Estado del Arte y Sustento Bibliográfico',
      'Validez de Resultados y Conclusiones',
      'Redacción Académica y Estructura Formal',
    ]);
  });

  it.each(RUBRIC_CRITERIA)('el criterio $key tiene cinco niveles con nombre y descriptor', (criterion) => {
    expect(criterion.levels.map((level) => level.score)).toEqual([1, 2, 3, 4, 5]);
    expect(criterion.levels.map((level) => level.name)).toEqual([
      'Deficiente',
      'Insuficiente',
      'Aceptable',
      'Bueno',
      'Excelente',
    ]);
    for (const level of criterion.levels) {
      expect(level.descriptor.length).toBeGreaterThan(20);
    }
  });

  it('los descriptores coinciden con la tabla de la especificación', () => {
    const rigor = RUBRIC_CRITERIA[1].levels;
    expect(rigor[0].descriptor).toBe(
      'El método no se describe o no es adecuado para el problema. No es posible reproducir el trabajo.',
    );
    expect(rigor[4].descriptor).toBe(
      'Método riguroso y justificado, con datos, instrumentos y procedimientos documentados para reproducirlo íntegramente.',
    );
    expect(RUBRIC_CRITERIA[4].levels[2].descriptor).toBe(
      'Redacción comprensible con errores ocasionales. Estructura y citación con fallas puntuales.',
    );
  });
});

describe('dictámenes', () => {
  it('ofrece los cuatro de la rúbrica 2', () => {
    expect(RECOMMENDATION_OPTIONS.map((o) => o.value)).toEqual([
      'ACCEPTED',
      'MINOR_REVISION',
      'MAJOR_REVISION',
      'REJECTED',
    ]);
  });

  it('etiqueta los de ambas versiones, incluidos los heredados', () => {
    expect(RECOMMENDATION_LABELS.MINOR_REVISION).toBe('Revisión menor');
    expect(RECOMMENDATION_LABELS.REQUIRES_CORRECTIONS).toBe('Requiere correcciones');
    expect(RECOMMENDATION_LABELS.REJECT).toBe('Rechazar');
  });

  it('conserva los criterios de la rúbrica 1 solo para leer el historial', () => {
    expect(LEGACY_SCORE_CRITERIA.map((c) => c.key)).toEqual([
      'originality_score',
      'methodology_score',
      'clarity_score',
      'relevance_score',
      'ethics_score',
    ]);
  });
});

describe('requiresJustification', () => {
  const scores = (value: number) => ({
    scientific_contribution: value,
    methodological_rigor: value,
    literature_grounding: value,
    results_conclusions: value,
    academic_writing: value,
  });

  it('no se exige con 4 o 5 y un dictamen leve', () => {
    expect(requiresJustification({ scores: scores(4), recommendation: 'ACCEPTED' })).toBe(false);
    expect(requiresJustification({ scores: scores(5), recommendation: 'MINOR_REVISION' })).toBe(false);
  });

  it('se exige con un criterio en 3 o menos', () => {
    expect(
      requiresJustification({ scores: { ...scores(5), academic_writing: 3 }, recommendation: 'ACCEPTED' }),
    ).toBe(true);
  });

  it('se exige con Revisión mayor o Rechazar', () => {
    expect(requiresJustification({ scores: scores(5), recommendation: 'MAJOR_REVISION' })).toBe(true);
    expect(requiresJustification({ scores: scores(5), recommendation: 'REJECTED' })).toBe(true);
  });
});

describe('characterCount', () => {
  it('recorta el texto antes de contar', () => {
    expect(characterCount('  hola  ')).toBe(4);
    expect(characterCount(null)).toBe(0);
  });

  it('cuenta puntos de código: un emoji vale 1', () => {
    expect(characterCount('😀😀')).toBe(2);
    expect(characterCount('😀'.repeat(JUSTIFICATION_MIN_LENGTH))).toBe(JUSTIFICATION_MIN_LENGTH);
  });
});
