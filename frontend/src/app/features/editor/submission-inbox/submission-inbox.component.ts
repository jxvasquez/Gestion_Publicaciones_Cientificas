import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  DEFAULT_SUBMISSION_ORDERING,
  SUBMISSION_ORDERINGS,
  SubmissionListParams,
  SubmissionOrdering,
  SubmissionRow,
} from '../../../core/models/editor.model';
import { Paginated } from '../../../core/models/paginated.model';
import { EditorService } from '../../../core/services/editor.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { RoundCounterComponent } from '../../../shared/components/round-counter.component';

/** Tamaño de página de la bandeja (la API admite hasta 100). */
export const PAGE_SIZE = 20;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Bandeja de nuevos envíos del Editor (plan sección 3.5, HU-10).
 *
 * * Lista solo los manuscritos `SUBMITTED` de su ámbito (el backend deja
 *   fuera los que el Editor registró o co-escribió): código, título,
 *   autor, área, fecha de envío, versión y ronda.
 * * Búsqueda, filtros por área y fechas, y orden.
 * * El estado vive en la URL (`search`, `area`, `date_from`, `date_to`,
 *   `ordering`, `page`): recargar o compartir el enlace conserva la vista.
 *   Un parámetro manipulado a mano que no es válido se ignora.
 * * No ofrece ninguna acción de auditoría global ni de Administrador.
 */
@Component({
  selector: 'app-submission-inbox',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    RoundCounterComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './submission-inbox.component.html',
  styleUrl: './submission-inbox.component.scss',
})
export class SubmissionInboxComponent {
  private readonly service = inject(EditorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly orderings = SUBMISSION_ORDERINGS;

  readonly filters = this.formBuilder.group(
    {
      search: [''],
      area: [''],
      date_from: [''],
      date_to: [''],
      ordering: [DEFAULT_SUBMISSION_ORDERING as string],
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
  protected readonly result = signal<Paginated<SubmissionRow> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly hasFilters = signal(false);

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => params),
        tap((params) => this.syncFromUrl(params)),
        switchMap((params) =>
          this.service.listSubmissions(toInboxParams(params)).pipe(
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

  protected rows(): SubmissionRow[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
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
    const { search, area, date_from, date_to, ordering } = this.filters.getRawValue();
    this.navigate({
      search: search.trim() || null,
      area: area.trim() || null,
      date_from: date_from || null,
      date_to: date_to || null,
      ordering: ordering === DEFAULT_SUBMISSION_ORDERING ? null : ordering,
      page: null,
    });
  }

  protected clearFilters(): void {
    this.navigate({
      search: null,
      area: null,
      date_from: null,
      date_to: null,
      ordering: null,
      page: null,
    });
  }

  protected goToPage(page: number): void {
    this.navigate({ page: page > 1 ? page : null });
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
    const list = toInboxParams(params);
    this.viewState.set('loading');
    this.currentPage.set(list.page ?? 1);
    this.hasFilters.set(!!(list.search || list.area || list.date_from || list.date_to));
    this.filters.reset(
      {
        search: list.search ?? '',
        area: list.area ?? '',
        date_from: list.date_from ?? '',
        date_to: list.date_to ?? '',
        ordering: list.ordering ?? DEFAULT_SUBMISSION_ORDERING,
      },
      { emitEvent: false },
    );
  }
}

/**
 * Parámetros de la URL a filtros de la API. Los valores que no son
 * válidos se descartan: una URL editada a mano nunca llega al backend.
 */
export function toInboxParams(params: ParamMap): SubmissionListParams {
  const result: SubmissionListParams = { page_size: PAGE_SIZE };

  for (const key of ['search', 'area'] as const) {
    const value = params.get(key)?.trim();
    if (value) {
      result[key] = value;
    }
  }
  for (const key of ['date_from', 'date_to'] as const) {
    const value = params.get(key);
    if (value && ISO_DATE.test(value)) {
      result[key] = value;
    }
  }
  const ordering = params.get('ordering');
  if (SUBMISSION_ORDERINGS.some((option) => option.value === ordering)) {
    result.ordering = ordering as SubmissionOrdering;
  }
  const page = Number.parseInt(params.get('page') ?? '', 10);
  if (Number.isInteger(page) && page > 1) {
    result.page = page;
  }
  return result;
}
