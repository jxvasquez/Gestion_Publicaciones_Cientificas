/**
 * Rúbrica profesional de cinco criterios (spec 004, FR-016 a FR-021).
 *
 * Los niveles y descriptores son los de la tabla de la especificación; el servidor
 * valida los mismos límites, así que estas reglas solo adelantan el error al Revisor.
 */

export type RubricKey =
  | 'scientific_contribution'
  | 'methodological_rigor'
  | 'literature_grounding'
  | 'results_conclusions'
  | 'academic_writing';

/** Puntuación de 1 a 5 de un criterio. */
export type RubricScore = 1 | 2 | 3 | 4 | 5;

export interface RubricLevel {
  score: RubricScore;
  name: string;
  descriptor: string;
}

export interface RubricCriterion {
  key: RubricKey;
  name: string;
  help: string;
  levels: readonly RubricLevel[];
}

const LEVEL_NAMES: Readonly<Record<RubricScore, string>> = {
  1: 'Deficiente',
  2: 'Insuficiente',
  3: 'Aceptable',
  4: 'Bueno',
  5: 'Excelente',
};

function levels(descriptors: readonly [string, string, string, string, string]): RubricLevel[] {
  return descriptors.map((descriptor, index) => {
    const score = (index + 1) as RubricScore;
    return { score, name: LEVEL_NAMES[score], descriptor };
  });
}

/** Los cinco criterios, en el orden de FR-016. */
export const RUBRIC_CRITERIA: readonly RubricCriterion[] = [
  {
    key: 'scientific_contribution',
    name: 'Pertinencia y Contribución Científica',
    help: 'Relación con la carrera o área y aporte del trabajo.',
    levels: levels([
      'No corresponde a la carrera o área declarada, o repite resultados conocidos sin aporte identificable.',
      'Pertinencia parcial. El aporte es mínimo o no se distingue de trabajos previos.',
      'Es pertinente y tiene un aporte incremental o delimitado de forma insuficiente.',
      'Es pertinente y su contribución, explícita, amplía el conocimiento o la práctica del área.',
      'Contribución original y significativa, con un impacto potencial evidente en el área.',
    ]),
  },
  {
    key: 'methodological_rigor',
    name: 'Rigor Metodológico y Reproducibilidad',
    help: 'Adecuación del método y posibilidad de reproducir el trabajo.',
    levels: levels([
      'El método no se describe o no es adecuado para el problema. No es posible reproducir el trabajo.',
      'Descripción incompleta y fallas que comprometen la validez. La reproducción no es viable.',
      'Método adecuado en general, con omisiones de datos, instrumentos o parámetros que dificultan reproducirlo.',
      'Método adecuado y descrito con detalle suficiente para reproducirlo, con limitaciones menores.',
      'Método riguroso y justificado, con datos, instrumentos y procedimientos documentados para reproducirlo íntegramente.',
    ]),
  },
  {
    key: 'literature_grounding',
    name: 'Estado del Arte y Sustento Bibliográfico',
    help: 'Calidad y actualidad de la revisión de antecedentes.',
    levels: levels([
      'No revisa antecedentes o sus referencias no se relacionan con el problema.',
      'Revisión escasa o desactualizada, sin vínculo claro con el problema planteado.',
      'Revisión suficiente, con vacíos relevantes o con fuentes poco académicas o desactualizadas.',
      'Revisión actualizada y pertinente que sitúa el problema, con vacíos menores.',
      'Revisión exhaustiva, crítica y actualizada que identifica con precisión la brecha que el trabajo atiende.',
    ]),
  },
  {
    key: 'results_conclusions',
    name: 'Validez de Resultados y Conclusiones',
    help: 'Sustento de los resultados y coherencia de las conclusiones.',
    levels: levels([
      'Faltan resultados o no tienen sustento. Las conclusiones no se relacionan con los datos.',
      'Resultados con errores o inconsistencias graves. Las conclusiones no se derivan de ellos.',
      'Resultados correctos en general con un análisis limitado. Algunas conclusiones exceden la evidencia.',
      'Resultados correctos y bien analizados. Las conclusiones son coherentes con la evidencia y reconocen sus limitaciones.',
      'Resultados sólidos discutidos frente a la literatura. Las conclusiones son precisas, sustentadas y explicitan sus limitaciones.',
    ]),
  },
  {
    key: 'academic_writing',
    name: 'Redacción Académica y Estructura Formal',
    help: 'Claridad, estructura y cumplimiento de las normas formales.',
    levels: levels([
      'Texto ininteligible o sin estructura. Incumple las normas formales.',
      'Errores frecuentes de redacción, estructura desordenada o incumplimiento reiterado de las normas de citación.',
      'Redacción comprensible con errores ocasionales. Estructura y citación con fallas puntuales.',
      'Redacción clara y estructura ordenada. Cumple las normas con errores menores.',
      'Redacción precisa y fluida, estructura impecable y cumplimiento total de las normas formales y de citación.',
    ]),
  },
];

export const RUBRIC_KEYS: readonly RubricKey[] = RUBRIC_CRITERIA.map((criterion) => criterion.key);

/** Dictamen de la evaluación (rúbrica 2). */
export type Recommendation = 'ACCEPTED' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECTED';

/** Dictámenes de las evaluaciones heredadas (rúbrica 1): solo lectura. */
export type LegacyRecommendation = 'ACCEPT' | 'REQUIRES_CORRECTIONS' | 'REJECT';

export const RECOMMENDATION_OPTIONS: readonly { value: Recommendation; label: string; help: string }[] = [
  { value: 'ACCEPTED', label: 'Aceptar', help: 'El manuscrito puede publicarse como está.' },
  { value: 'MINOR_REVISION', label: 'Revisión menor', help: 'Requiere ajustes menores del Autor.' },
  { value: 'MAJOR_REVISION', label: 'Revisión mayor', help: 'Requiere cambios sustanciales; exige justificación.' },
  { value: 'REJECTED', label: 'Rechazar', help: 'No es publicable; exige justificación.' },
];

/** Etiquetas de ambas versiones de la rúbrica, para leer el historial. */
export const RECOMMENDATION_LABELS: Readonly<Record<Recommendation | LegacyRecommendation, string>> = {
  ACCEPTED: 'Aceptar',
  MINOR_REVISION: 'Revisión menor',
  MAJOR_REVISION: 'Revisión mayor',
  REJECTED: 'Rechazar',
  ACCEPT: 'Aceptar',
  REQUIRES_CORRECTIONS: 'Requiere correcciones',
  REJECT: 'Rechazar',
};

/** Criterios de la rúbrica 1, que solo muestran las evaluaciones heredadas. */
export const LEGACY_SCORE_CRITERIA: readonly { key: string; name: string }[] = [
  { key: 'originality_score', name: 'Originalidad' },
  { key: 'methodology_score', name: 'Metodología' },
  { key: 'clarity_score', name: 'Claridad' },
  { key: 'relevance_score', name: 'Relevancia' },
  { key: 'ethics_score', name: 'Ética' },
];

/** Caracteres mínimos de los comentarios para el autor cuando se exigen (FR-019). */
export const JUSTIFICATION_MIN_LENGTH = 100;

/** Un criterio con este valor o menos exige justificación. */
export const JUSTIFICATION_SCORE_THRESHOLD = 3;

/** Lo que la regla de justificación necesita saber de una evaluación. */
export interface JustificationInput {
  scores: Partial<Record<RubricKey, number | null>>;
  recommendation: Recommendation | null;
}

/** FR-019: algún criterio en 3 o menos, Revisión mayor o Rechazar. */
export function requiresJustification(input: JustificationInput): boolean {
  const low = RUBRIC_KEYS.some((key) => {
    const score = input.scores[key];
    return score !== null && score !== undefined && score <= JUSTIFICATION_SCORE_THRESHOLD;
  });
  return low || input.recommendation === 'MAJOR_REVISION' || input.recommendation === 'REJECTED';
}

/** Puntos de código del texto recortado: igual que `len(text.strip())` del servidor. */
export function characterCount(text: string | null | undefined): number {
  return Array.from((text ?? '').trim()).length;
}
