/**
 * Carreras o áreas académicas validadas (spec 004, FR-007).
 *
 * `code` es estable y lo usan la API y los filtros; `name` es lo que se muestra.
 */
export interface AcademicArea {
  code: string;
  name: string;
}

/** Fila del catálogo del Administrador (`GET /api/v1/admin/areas/`). */
export interface AdminArea extends AcademicArea {
  is_active: boolean;
  manuscripts: number;
  reviewers: number;
}

/** Cambios admitidos al modificar una carrera; el `code` nunca cambia. */
export interface AreaChanges {
  name?: string;
  is_active?: boolean;
}

/** Fila del padrón de revisores (`GET /api/v1/admin/reviewers/`). */
export interface RosterReviewer {
  id: string;
  full_name: string;
  email: string;
  institutional_id: string;
  is_available: boolean;
  areas: AcademicArea[];
  ranking_score: number;
  active_assignments: number;
  max_active_assignments: number;
  on_time_evaluations: number;
  missed_deadlines: number;
}

/** Cuerpo de `PATCH /admin/reviewers/{id}/`: ambos campos son opcionales. */
export interface RosterChanges {
  areas?: string[];
  is_available?: boolean;
}

/** Filtros del padrón. */
export interface RosterParams {
  area?: string;
  available?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

/** Máximo de carreras por manuscrito (FR-008). */
export const MAX_AREAS_PER_MANUSCRIPT = 3;

/** Nombres separados por coma, para listados y badges de solo lectura. */
export function areaNames(areas: readonly AcademicArea[] | null | undefined): string {
  return (areas ?? []).map((area) => area.name).join(', ');
}
