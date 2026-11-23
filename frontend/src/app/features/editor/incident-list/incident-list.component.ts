import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { toPage } from '../../../core/http/query-params';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  DEFAULT_INCIDENT_FILTER,
  INCIDENT_FILTERS,
  INCIDENT_RESOLUTIONS,
  INCIDENT_TYPE_LABELS,
  Incident,
  IncidentFilter,
  IncidentResolution,
} from '../../../core/models/editor.model';
import { Paginated } from '../../../core/models/paginated.model';
import { EditorService } from '../../../core/services/editor.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';

/** Tamaño de página de la vista (la API admite hasta 100). */
export const PAGE_SIZE = 20;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

const RESOLVED_BY_ANOTHER =
  'Otro Editor ya resolvió este reporte. La lista se actualizó con su resultado.';

/** Qué reporte se va a resolver y cómo, a la espera de la confirmación del Editor. */
interface PendingResolution {
  incident: Incident;
  resolution: (typeof INCIDENT_RESOLUTIONS)[number];
}

/**
 * Bandeja de incidentes confidenciales del Editor (plan sección 3.5, HU-16).
 *
 * * Lista los reportes de los Revisores, los abiertos primero; el filtro
 *   (Abiertos por defecto, Resueltos o Todos) y la página viven en la URL
 *   (`status`, `page`) y un valor manipulado se ignora.
 * * **Confidencial:** el Editor ve la descripción y quién reportó; el Autor
 *   nunca llega a esta pantalla ni a este tipo de dato.
 * * Un reporte abierto se resuelve **una sola vez**: solicitar una versión
 *   anonimizada, reasignar o descartar. Cada opción explica sus efectos y
 *   pide confirmación antes de actuar.
 * * Si otro Editor se adelantó (`409`) lo dice, no repite nada y vuelve a
 *   leer la lista para mostrar el estado real.
 */
@Component({
  selector: 'app-incident-list',
  imports: [
    DatePipe,
    RouterLink,
    StatusBadgeComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './incident-list.component.html',
  styleUrl: './incident-list.component.scss',
})
export class IncidentListComponent {
  private readonly service = inject(EditorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly filters = INCIDENT_FILTERS;
  protected readonly resolutions = INCIDENT_RESOLUTIONS;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly result = signal<Paginated<Incident> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly filter = signal<IncidentFilter>(DEFAULT_INCIDENT_FILTER);

  protected readonly pending = signal<PendingResolution | null>(null);
  protected readonly resolving = signal(false);
  protected readonly actionError = signal('');
  protected readonly notice = signal<{
    message: string;
    manuscriptId: string;
    manuscriptCode: string;
    followUp: boolean;
  } | null>(null);

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => ({ filter: toFilter(params), page: toPage(params) })),
        tap(({ filter, page }) => {
          this.viewState.set('loading');
          this.filter.set(filter);
          this.currentPage.set(page);
        }),
        switchMap(({ filter, page }) =>
          this.service.listIncidents(filter, page, PAGE_SIZE).pipe(
            map((data) => ({ data, error: null as ApiError | null })),
            catchError((error: unknown) => of({ data: null, error: toApiError(error) })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ data, error }) => {
        this.result.set(data);
        this.error.set(error);
        this.viewState.set(error ? 'error' : 'ready');
      });
  }

  protected rows(): Incident[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  protected emptyMessage(): string {
    switch (this.filter()) {
      case 'OPEN':
        return 'No hay reportes abiertos.';
      case 'RESOLVED':
        return 'Todavía no se ha resuelto ningún reporte.';
      default:
        return 'No hay reportes.';
    }
  }

  protected typeLabel(incident: Incident): string {
    return INCIDENT_TYPE_LABELS[incident.report_type] ?? incident.report_type;
  }

  protected resolutionLabel(incident: Incident): string {
    return INCIDENT_RESOLUTIONS.find((r) => r.value === incident.resolution)?.label ?? 'Resuelto';
  }

  protected confirmMessage(): string {
    const pending = this.pending();
    if (pending === null) {
      return '';
    }
    return `${pending.incident.manuscript_code}: ${pending.resolution.effect} El reporte se resuelve una sola vez y no se puede deshacer.`;
  }

  protected filterParams(value: IncidentFilter): Record<string, string | null> {
    return { status: value === DEFAULT_INCIDENT_FILTER ? null : value, page: null };
  }

  protected reload(): void {
    this.retry$.next();
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  /** Pide confirmación: nada se resuelve hasta que el Editor la da. */
  protected ask(incident: Incident, resolution: IncidentResolution): void {
    const option = INCIDENT_RESOLUTIONS.find((r) => r.value === resolution);
    if (option === undefined || this.resolving()) {
      return;
    }
    this.notice.set(null);
    this.actionError.set('');
    this.pending.set({ incident, resolution: option });
  }

  protected confirm(): void {
    const pending = this.pending();
    if (pending === null || this.resolving()) {
      return;
    }
    this.pending.set(null);
    this.resolving.set(true);
    this.service.resolveIncident(pending.incident.id, pending.resolution.value).subscribe({
      next: () => {
        this.resolving.set(false);
        this.notice.set({
          message: `Reporte de ${pending.incident.manuscript_code} resuelto: ${pending.resolution.label.toLowerCase()}.`,
          manuscriptId: pending.incident.manuscript,
          manuscriptCode: pending.incident.manuscript_code,
          followUp: pending.resolution.value === 'REASSIGN',
        });
        this.reload();
      },
      error: (error: ApiError) => {
        this.resolving.set(false);
        // Con 409 otro Editor se adelantó o el manuscrito ya no está en revisión:
        // se dice y se vuelve a leer para mostrar el estado real.
        this.actionError.set(error.status === 409 ? conflictMessage(error) : error.userMessage);
        if (error.status === 409) {
          this.reload();
        }
      },
    });
  }
}

/** Filtro de la URL; cualquier valor desconocido vuelve al predeterminado. */
export function toFilter(params: ParamMap): IncidentFilter {
  const value = params.get('status');
  return INCIDENT_FILTERS.some((option) => option.value === value)
    ? (value as IncidentFilter)
    : DEFAULT_INCIDENT_FILTER;
}

/** El mensaje del servidor distingue «ya resuelto» de «el manuscrito ya no está en revisión». */
function conflictMessage(error: ApiError): string {
  return error.message.includes('ya fue resuelto') ? RESOLVED_BY_ANOTHER : error.message;
}
