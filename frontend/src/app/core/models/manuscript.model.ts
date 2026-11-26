/**
 * Modelos del módulo Autor (plan secciones 2.3 y 3.6).
 *
 * Reflejan `AuthorManuscriptSerializer` del backend: la vista del Autor
 * nunca incluye la identidad del Revisor, comentarios confidenciales ni
 * puntuaciones internas. `EvaluationFeedback` es la única parte de una
 * evaluación que el Autor puede leer (`AuthorEvaluationFeedbackSerializer`).
 */

import { AcademicArea } from './area.model';

export type ManuscriptStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'TIE_BREAKER'
  | 'CHANGES_REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED';

/** Estado heredado: solo aparece en historiales anteriores a la revisión automática. */
export const LEGACY_STATUS = 'REQUIRES_CORRECTIONS';

export const MANUSCRIPT_STATUSES: readonly ManuscriptStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'TIE_BREAKER',
  'CHANGES_REQUESTED',
  'ACCEPTED',
  'REJECTED',
];

/** Estados en los que el Autor puede editar los metadatos y las carreras (RN, HU-07). */
export const EDITABLE_STATUSES: readonly ManuscriptStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];

/** Decisión del veredicto (automático o corregido por el Administrador). */
export type VerdictDecision = 'ACCEPTED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface ManuscriptAuthor {
  full_name: string;
  email: string;
  affiliation: string;
  is_corresponding: boolean;
  author_order?: number;
}

/** PDF de borrador adjunto: solo nombre, tamaño y fecha, nunca la ruta. */
export interface DraftFileSummary {
  filename: string;
  size_bytes: number;
  uploaded_at: string;
}

/** Reseña de un revisor, identificada solo por «Revisor N»: nunca su identidad. */
export interface FeedbackReview {
  label: string;
  comments_for_author: string;
}

/**
 * Lo único que el Autor lee de las evaluaciones: la decisión, su origen y las
 * reseñas «Revisor N». La interfaz no declara (ni renderiza) identidades,
 * puntajes, dictámenes individuales ni el ranking.
 */
export interface EvaluationFeedback {
  decision: string;
  decided_at: string;
  origin: string;
  observations: string | null;
  reviews: FeedbackReview[];
}

export interface Manuscript {
  id: string;
  code: string;
  title: string;
  abstract: string;
  keywords: string[];
  areas: AcademicArea[];
  language: string;
  status: ManuscriptStatus;
  current_round: number;
  current_version: number;
  is_active: boolean;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
  authors: ManuscriptAuthor[];
  draft_file: DraftFileSummary | null;
  /** Presente cuando existe una evaluación y un veredicto (TSK-50/52). */
  feedback?: EvaluationFeedback | null;
  created_at: string;
  updated_at: string;
}

/**
 * Eventos de la carga del PDF de borrador: el avance (`percent` es
 * `null` si el navegador no conoce el total) y el resultado final.
 * `replaced` es verdadero cuando sustituyó a un borrador anterior (`200`)
 * y falso en la primera carga (`201`).
 */
export type DraftUploadEvent =
  | { kind: 'progress'; percent: number | null }
  | { kind: 'done'; draft: DraftFileSummary; replaced: boolean };

/**
 * Resultado de un envío formal o de una nueva versión
 * (`POST .../submit/` y `POST .../versions/`): el código de seguimiento,
 * la versión y la ronda creadas, la fecha y el sello de integridad
 * `sha256:<hex>` del PDF exacto.
 */
export interface SubmissionResult {
  code: string;
  status: ManuscriptStatus;
  version_number: number;
  round_number: number;
  submitted_at: string;
  integrity_seal: string;
}

/** Eventos de la carga de una nueva versión: avance y resultado final. */
export type VersionUploadEvent =
  { kind: 'progress'; percent: number | null } | { kind: 'done'; submission: SubmissionResult };

/** Fila de `GET .../versions/`: una iteración con el sello de su PDF. */
export interface VersionSummary {
  id: string;
  version_number: number;
  round_number: number;
  original_filename: string;
  original_size_bytes: number;
  original_sha256: string;
  submitted_at: string;
}

/** Entradas del historial inmutable (`GET .../history/`, HU-23). */
export interface StatusHistoryEntry {
  type: 'CREATED' | 'STATUS_CHANGED' | 'WITHDRAWN';
  occurred_at: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  version_number: number | null;
  round_number: number | null;
}

/** Una iteración formal: el PDF exacto y los sellos de integridad. */
export interface VersionHistoryEntry {
  type: 'VERSION_SUBMITTED';
  occurred_at: string;
  version_id: string;
  version_number: number;
  round_number: number;
  original_filename: string;
  original_size_bytes: number;
  /** `sha256:<hex>` del PDF original. */
  integrity_seal: string;
  metadata_sha256: string;
}

export interface RoundHistoryEntry {
  type: 'ROUND_OPENED';
  occurred_at: string;
  round_number: number;
  closed_at: string | null;
  closed_by_version_number: number | null;
}

export type HistoryEntry = StatusHistoryEntry | VersionHistoryEntry | RoundHistoryEntry;

/** PDF descargado: el contenido y el nombre sugerido por el servidor. */
export interface VersionDownload {
  blob: Blob;
  filename: string;
}

/** Estados en los que la baja lógica exige un motivo (CA-HU-08-02). */
export const WITHDRAWAL_REASON_REQUIRED: readonly ManuscriptStatus[] = [
  'UNDER_REVIEW',
  'TIE_BREAKER',
  'ACCEPTED',
];

export function requiresWithdrawalReason(status: ManuscriptStatus): boolean {
  return WITHDRAWAL_REASON_REQUIRED.includes(status);
}

/** Un manuscrito junto con su `ETag` vigente (bloqueo optimista). */
export interface ManuscriptSnapshot {
  manuscript: Manuscript;
  etag: string | null;
}

export interface AuthorPayload {
  full_name: string;
  email: string;
  affiliation: string;
  is_corresponding: boolean;
}

export interface ManuscriptPayload {
  title: string;
  abstract: string;
  keywords: string[];
  /** Códigos de 1 a 3 carreras activas. */
  areas: string[];
  language: string;
  authors: AuthorPayload[];
}

/** Filtros del listado (`GET /api/v1/manuscripts/`, plan sección 2.1). */
export interface ManuscriptListParams {
  status?: ManuscriptStatus;
  date_from?: string;
  date_to?: string;
  /** `true` pide los manuscritos dados de baja (vista de archivados). */
  archived?: boolean;
  page?: number;
  page_size?: number;
}

/** El Autor edita solo en `DRAFT` o `CHANGES_REQUESTED` y si no está dado de baja. */
export function isEditable(manuscript: Pick<Manuscript, 'status' | 'is_active'>): boolean {
  return manuscript.is_active && EDITABLE_STATUSES.includes(manuscript.status);
}

/** Texto breve para el listado y texto completo para el detalle. */
export interface NextAction {
  short: string;
  detail: string;
}

const NEXT_ACTION_BY_STATUS: Record<ManuscriptStatus, NextAction> = {
  DRAFT: {
    short: 'Completar y enviar',
    detail: 'Complete los datos, elija sus carreras, adjunte el PDF y envíe el manuscrito a revisión.',
  },
  SUBMITTED: {
    short: 'En espera de revisores',
    detail:
      'El sistema asigna dos revisores de su carrera en cuanto haya candidatos elegibles. No requiere acción de su parte.',
  },
  UNDER_REVIEW: {
    short: 'En revisión',
    detail: 'El manuscrito está siendo evaluado por dos revisores. No requiere acción de su parte.',
  },
  TIE_BREAKER: {
    short: 'En desempate',
    detail:
      'Los dos primeros dictámenes no coinciden: un tercer revisor decidirá por mayoría. No requiere acción de su parte.',
  },
  CHANGES_REQUESTED: {
    short: 'Enviar nueva versión',
    detail:
      'Atienda los comentarios de los revisores, edite los datos si hace falta y envíe una nueva versión con el PDF corregido.',
  },
  ACCEPTED: {
    short: 'Publicado',
    detail: 'El manuscrito fue aceptado y se publica en el catálogo público.',
  },
  REJECTED: {
    short: 'Sin acciones pendientes',
    detail: 'El manuscrito fue rechazado. Puede archivarlo con la baja lógica.',
  },
};

const NEXT_ACTION_ARCHIVED: NextAction = {
  short: 'Archivado',
  detail:
    'El manuscrito fue dado de baja. Se conserva en modo de solo lectura con todo su historial.',
};

/** Acción pendiente del Autor según el estado y la baja lógica. */
export function nextAction(manuscript: Pick<Manuscript, 'status' | 'is_active'>): NextAction {
  return manuscript.is_active ? NEXT_ACTION_BY_STATUS[manuscript.status] : NEXT_ACTION_ARCHIVED;
}

/** Situación de una etapa del ciclo editorial respecto del manuscrito. */
export type StageState = 'done' | 'current' | 'upcoming';

export type StageTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Etapa del indicador de progreso (spec 005, FR-011). Se deriva: no se almacena. */
export interface EditorialStage {
  key: 'draft' | 'submitted' | 'review' | 'decision';
  label: string;
  state: StageState;
  tone: StageTone;
}

const EDITORIAL_STAGES: readonly Pick<EditorialStage, 'key' | 'label'>[] = [
  { key: 'draft', label: 'Borrador' },
  { key: 'submitted', label: 'Enviado' },
  { key: 'review', label: 'En revisión' },
  { key: 'decision', label: 'Decisión' },
];

/**
 * Etapa alcanzada por cada estado, con su rótulo y tono cuando difieren de los de la
 * etapa. `closed` indica que el ciclo terminó y esa etapa ya está completada.
 */
const REACHED_STAGE: Record<
  ManuscriptStatus,
  { index: number; label?: string; tone?: StageTone; closed?: boolean }
> = {
  DRAFT: { index: 0 },
  SUBMITTED: { index: 1, label: 'En espera de revisores' },
  UNDER_REVIEW: { index: 2 },
  TIE_BREAKER: { index: 2, label: 'En desempate' },
  CHANGES_REQUESTED: { index: 3, label: 'Cambios solicitados', tone: 'warning' },
  ACCEPTED: { index: 3, label: 'Aceptado', tone: 'success', closed: true },
  REJECTED: { index: 3, label: 'Rechazado', tone: 'danger', closed: true },
};

/**
 * Las cuatro etapas del ciclo editorial según el estado. En un manuscrito dado de baja
 * la etapa alcanzada se rotula así, en tono neutro, y las posteriores quedan pendientes.
 */
export function editorialStages(
  manuscript: Pick<Manuscript, 'status' | 'is_active'>,
): EditorialStage[] {
  const reached = REACHED_STAGE[manuscript.status];
  return EDITORIAL_STAGES.map(({ key, label }, index): EditorialStage => {
    if (index !== reached.index) {
      return index < reached.index
        ? { key, label, state: 'done', tone: 'info' }
        : { key, label, state: 'upcoming', tone: 'neutral' };
    }
    const state = reached.closed ? 'done' : 'current';
    return manuscript.is_active
      ? { key, label: reached.label ?? label, state, tone: reached.tone ?? 'info' }
      : { key, label: 'Dado de baja', state, tone: 'neutral' };
  });
}
