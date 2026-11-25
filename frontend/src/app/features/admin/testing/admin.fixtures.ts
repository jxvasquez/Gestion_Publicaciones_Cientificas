import { AdminArea, RosterReviewer } from '../../../core/models/area.model';
import { Incident } from '../../../core/models/incident.model';
import { Paginated } from '../../../core/models/paginated.model';

/** Datos de ejemplo del módulo del Administrador para las pruebas. */
export function buildIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'i-1',
    status: 'OPEN',
    report_type: 'IDENTITY_LEAK',
    description: 'La portada del PDF trae el nombre de una autora.',
    manuscript: 's-1',
    manuscript_code: 'GPC-2026-000001',
    manuscript_title: 'Efecto del clima en cultivos andinos',
    manuscript_status: 'UNDER_REVIEW',
    version_number: 1,
    assignment: 'a-1',
    reporter: { id: 'r-1', full_name: 'Marta Ruiz', email: 'marta@unl.edu.ec' },
    created_at: '2026-10-25T20:00:00Z',
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    correction_round_number: null,
    ...overrides,
  };
}

export function buildIncidentPage(
  results: Incident[],
  count: number = results.length,
): Paginated<Incident> {
  return { count, next: null, previous: null, results };
}

export function buildAdminArea(overrides: Partial<AdminArea> = {}): AdminArea {
  return {
    code: 'derecho',
    name: 'Derecho',
    is_active: true,
    manuscripts: 2,
    reviewers: 3,
    ...overrides,
  };
}

export function buildRosterReviewer(overrides: Partial<RosterReviewer> = {}): RosterReviewer {
  return {
    id: 'u-1',
    full_name: 'Rosa Revisora',
    email: 'rosa@unl.edu.ec',
    institutional_id: 'INST-1',
    is_available: true,
    areas: [{ code: 'derecho', name: 'Derecho' }],
    ranking_score: 110,
    active_assignments: 3,
    max_active_assignments: 5,
    on_time_evaluations: 2,
    missed_deadlines: 1,
    ...overrides,
  };
}
