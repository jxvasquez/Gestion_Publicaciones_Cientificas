import { PersonSummary } from './person.model';

/** Estado de un reporte confidencial de un Revisor. */
export type IncidentStatus = 'OPEN' | 'RESOLVED';

/** Cómo resuelve el Administrador un reporte; se resuelve una sola vez. */
export type IncidentResolution = 'REQUEST_ANONYMIZED_VERSION' | 'REASSIGN' | 'DISMISS';

/** Reporte confidencial tal como lo lee el Administrador (`GET /admin/incidents/`). */
export interface Incident {
  id: string;
  status: IncidentStatus;
  report_type: string;
  description: string;
  manuscript: string;
  manuscript_code: string;
  manuscript_title: string;
  manuscript_status: string;
  version_number: number;
  assignment: string;
  reporter: PersonSummary;
  created_at: string;
  resolution: IncidentResolution | null;
  resolved_by: PersonSummary | null;
  resolved_at: string | null;
  correction_round_number: number | null;
}

/** Filtro de la bandeja: abiertos (por defecto), resueltos o todos. */
export type IncidentFilter = 'OPEN' | 'RESOLVED' | 'ALL';

export const INCIDENT_FILTERS: readonly { value: IncidentFilter; label: string }[] = [
  { value: 'OPEN', label: 'Abiertos' },
  { value: 'RESOLVED', label: 'Resueltos' },
  { value: 'ALL', label: 'Todos' },
];

export const DEFAULT_INCIDENT_FILTER: IncidentFilter = 'OPEN';

export const INCIDENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  IDENTITY_LEAK: 'Posible fuga de identidad',
  OTHER: 'Otro (canal confidencial)',
};

/** Resoluciones posibles, con lo que cada una provoca (se muestra antes de confirmar). */
export const INCIDENT_RESOLUTIONS: readonly {
  value: IncidentResolution;
  label: string;
  action: string;
  effect: string;
  destructive: boolean;
}[] = [
  {
    value: 'REQUEST_ANONYMIZED_VERSION',
    label: 'Versión anonimizada solicitada',
    action: 'Solicitar versión anonimizada',
    effect:
      'Se liberarán sin penalización todas las asignaciones activas, el manuscrito pasará a «Cambios solicitados» y se abrirá una nueva ronda para que el Autor envíe una versión anonimizada. El Autor no sabrá quién reportó ni que existe el reporte.',
    destructive: true,
  },
  {
    value: 'REASSIGN',
    label: 'Reasignado',
    action: 'Reasignar Revisor',
    effect:
      'Se liberará sin penalización la asignación de quien reportó, aunque ya haya enviado su evaluación, y el sistema cubrirá el cupo con otro revisor elegible.',
    destructive: true,
  },
  {
    value: 'DISMISS',
    label: 'Descartado',
    action: 'Descartar reporte',
    effect: 'El reporte se cerrará sin cambiar el manuscrito ni la asignación del Revisor.',
    destructive: false,
  },
];
