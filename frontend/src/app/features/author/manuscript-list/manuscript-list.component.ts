import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  MANUSCRIPT_STATUSES,
  Manuscript,
  ManuscriptListParams,
  ManuscriptStatus,
  isEditable,
  nextAction,
} from '../../../core/models/manuscript.model';
import { Paginated } from '../../../core/models/paginated.model';
import { ManuscriptService } from '../../../core/services/manuscript.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { RoundCounterComponent } from '../../../shared/components/round-counter.component';
import {
  STATUS_LABELS,
  StatusBadgeComponent,
} from '../../../shared/components/status-badge.component';

/** Tamaño de página del listado (la API admite hasta 100). */
export const PAGE_SIZE = 20;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Listado propio de manuscritos del Autor (plan sección 3.5, HU-06).
 *
 * * Tabla paginada con código, título, estado, versión, ronda, última
 *   actualización y acción pendiente.
 * * Filtros por estado y fecha, y vista de archivados (dados de baja).
 * * El estado vive en la URL (`status`, `date_from`, `date_to`,
 *   `archived`, `page`): recargar o compartir el enlace conserva la
 *   vista. Un parámetro manipulado a mano que no es válido se ignora
 *   en lugar de provocar un `400`.
 * * La edición solo se ofrece en `DRAFT` o `REQUIRES_CORRECTIONS`.
 */
@Component({
  selector: 'app-manuscript-list',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    StatusBadgeComponent,
    RoundCounterComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './manuscript-list.component.html',
  styleUrl: './manuscript-list.component.scss',
})
export class ManuscriptListComponent {
  private readonly service = inject(ManuscriptService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly statuses = MANUSCRIPT_STATUSES;

  readonly filters = this.formBuilder.group(
    {
      status: [''],
      date_from: [''],
      date_to: [''],
      archived: [false],
    },
    {
      validators: (group) => {
        const from = group.get('date_from')?.value as string;
        const to = group.get('date_to')?.value as string;
        return from && to && from > to ? { dateRange: true } : null;
      },
    },
  );

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly result = signal<Paginated<Manuscript> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly archivedView = signal(false);
  protected readonly hasFilters = signal(false);

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => params),
        tap((params) => this.syncFromUrl(params)),
        switchMap((params) =>
          this.service.list(toListParams(params)).pipe(
            map((page) => ({ page, error: null as ApiError | null })),
            catchError((error: unknown) => of({ page: null, error: toApiError(error) })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ page, error }) => {
        this.result.set(page);
        this.error.set(error);
        this.viewState.set(error ? 'error' : 'ready');
      });
  }

  protected rows(): Manuscript[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  protected label(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  protected canEdit(manuscript: Manuscript): boolean {
    return isEditable(manuscript);
  }

  protected pending(manuscript: Manuscript): string {
    return nextAction(manuscript).short;
  }

  protected reload(): void {
    this.viewState.set('loading');
    this.retry$.next();
  }

  protected applyFilters(): void {
    if (this.filters.invalid) {
      this.filters.markAllAsTouched();
      return;
    }
    const { status, date_from, date_to, archived } = this.filters.getRawValue();
    this.navigate({
      status: status || null,
      date_from: date_from || null,
      date_to: date_to || null,
      archived: archived ? 'true' : null,
      page: null,
    });
  }

  protected clearFilters(): void {
    this.navigate({ status: null, date_from: null, date_to: null, archived: null, page: null });
  }

  protected goToPage(page: number): void {
    this.navigate({ page: page > 1 ? page : null });
  }

  protected createFirst(): void {
    void this.router.navigate(['/app/author/manuscripts/new']);
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  /** Refleja la URL en el formulario y en el estado de la vista. */
  private syncFromUrl(params: ParamMap): void {
    const list = toListParams(params);
    this.viewState.set('loading');
    this.currentPage.set(list.page ?? 1);
    this.archivedView.set(!!list.archived);
    this.hasFilters.set(!!(list.status || list.date_from || list.date_to));
    this.filters.reset(
      {
        status: list.status ?? '',
        date_from: list.date_from ?? '',
        date_to: list.date_to ?? '',
        archived: !!list.archived,
      },
      { emitEvent: false },
    );
  }
}

/**
 * Parámetros de la URL a filtros de la API. Los valores que no son
 * válidos se descartan: una URL editada a mano nunca llega al backend.
 */
export function toListParams(params: ParamMap): ManuscriptListParams {
  const result: ManuscriptListParams = { page_size: PAGE_SIZE };

  const status = params.get('status');
  if (status && (MANUSCRIPT_STATUSES as readonly string[]).includes(status)) {
    result.status = status as ManuscriptStatus;
  }
  for (const key of ['date_from', 'date_to'] as const) {
    const value = params.get(key);
    if (value && ISO_DATE.test(value)) {
      result[key] = value;
    }
  }
  if (params.get('archived') === 'true') {
    result.archived = true;
  }
  const page = Number.parseInt(params.get('page') ?? '', 10);
  if (Number.isInteger(page) && page > 1) {
    result.page = page;
  }
  return result;
}
