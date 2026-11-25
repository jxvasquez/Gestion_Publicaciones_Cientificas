import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { toPage } from '../../../core/http/query-params';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import { Paginated } from '../../../core/models/paginated.model';
import { areaNames } from '../../../core/models/area.model';
import {
  MAX_SCORE,
  ReviewerHistoryDetail,
  ReviewerHistoryRow,
} from '../../../core/models/reviewer.model';
import {
  LEGACY_SCORE_CRITERIA,
  RECOMMENDATION_LABELS,
  RUBRIC_CRITERIA,
} from '../../../core/models/rubric.model';
import { ReviewerService } from '../../../core/services/reviewer.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';

/** Tamaño de página de la vista (la API admite hasta 100). */
export const PAGE_SIZE = 20;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/** Estado de carga del detalle de una fila. */
type DetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; detail: ReviewerHistoryDetail }
  | { kind: 'error'; message: string };

/**
 * Historial propio de evaluaciones del Revisor (plan sección 3.5, HU-17).
 *
 * * **Solo lectura:** lista únicamente las evaluaciones ya enviadas, de la
 *   más reciente a la más antigua, y no ofrece editar, reenviar ni borrar.
 * * **Anónimo:** identifica el manuscrito por código, título y carreras, y el
 *   resultado es solo la decisión y su fecha. Nunca muestra autores, ni los
 *   textos de la decisión que recibe el Autor.
 * * **Sin comentarios confidenciales:** el detalle muestra los puntajes y
 *   los comentarios para el Autor; el tipo `ReviewerHistoryDetail` ni siquiera
 *   declara los confidenciales, así que no hay forma de pintarlos.
 * * La página vive en la URL (`page`); un valor manipulado se ignora. El
 *   detalle se pide al abrir cada fila y se conserva mientras la vista siga.
 */
@Component({
  selector: 'app-evaluation-history',
  imports: [
    DatePipe,
    RouterLink,
    StatusBadgeComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './evaluation-history.component.html',
  styleUrl: './evaluation-history.component.scss',
})
export class EvaluationHistoryComponent {
  private readonly service = inject(ReviewerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly areaNames = areaNames;
  protected readonly maxScore = MAX_SCORE;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly result = signal<Paginated<ReviewerHistoryRow> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);

  protected readonly openId = signal<string | null>(null);
  private readonly details = signal<Record<string, DetailState>>({});

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => toPage(params)),
        tap((page) => {
          this.viewState.set('loading');
          this.currentPage.set(page);
          this.openId.set(null);
        }),
        switchMap((page) =>
          this.service.listHistory(page, PAGE_SIZE).pipe(
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

  protected rows(): ReviewerHistoryRow[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  /** Criterios de la rúbrica de la evaluación: la profesional o la anterior (solo lectura). */
  protected criteriaOf(detail: ReviewerHistoryDetail): { label: string; score: number | null }[] {
    const names =
      detail.rubric_version === 1
        ? LEGACY_SCORE_CRITERIA.map((c) => ({ key: c.key, label: c.name }))
        : RUBRIC_CRITERIA.map((c) => ({ key: c.key as string, label: c.name }));
    return names.map(({ key, label }) => ({ label, score: detail.scores[key] ?? null }));
  }

  protected recommendationLabel(row: ReviewerHistoryRow): string {
    return RECOMMENDATION_LABELS[row.recommendation] ?? row.recommendation;
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

  protected stateOf(id: string): DetailState | undefined {
    return this.details()[id];
  }

  protected detailOf(id: string): ReviewerHistoryDetail | null {
    const state = this.details()[id];
    return state?.kind === 'ready' ? state.detail : null;
  }

  protected errorOf(id: string): string {
    const state = this.details()[id];
    return state?.kind === 'error' ? state.message : '';
  }

  /** Abre o cierra una fila; el detalle se pide la primera vez y se conserva. */
  protected toggle(row: ReviewerHistoryRow): void {
    if (this.openId() === row.id) {
      this.openId.set(null);
      return;
    }
    this.openId.set(row.id);
    if (this.details()[row.id]?.kind !== 'ready') {
      this.loadDetail(row);
    }
  }

  protected retryDetail(row: ReviewerHistoryRow): void {
    this.loadDetail(row);
  }

  private loadDetail(row: ReviewerHistoryRow): void {
    this.setDetail(row.id, { kind: 'loading' });
    this.service.getHistoryEntry(row.id).subscribe({
      next: (detail) => this.setDetail(row.id, { kind: 'ready', detail }),
      error: (error: ApiError) =>
        this.setDetail(row.id, { kind: 'error', message: error.userMessage }),
    });
  }

  private setDetail(id: string, state: DetailState): void {
    this.details.update((current) => ({ ...current, [id]: state }));
  }
}
