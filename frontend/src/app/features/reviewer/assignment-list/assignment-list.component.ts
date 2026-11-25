import { areaNames } from '../../../core/models/area.model';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { toPage } from '../../../core/http/query-params';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import { Paginated } from '../../../core/models/paginated.model';
import { ReviewerAssignmentRow, hasDetail } from '../../../core/models/reviewer.model';
import { ReviewerService } from '../../../core/services/reviewer.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { ReviewerStandingComponent } from '../reviewer-standing/reviewer-standing.component';

/** Tamaño de página de la vista (la API admite hasta 100). */
export const PAGE_SIZE = 20;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Bandeja de asignaciones del Revisor (plan sección 3.5, HU-14).
 *
 * * Lista solo las asignaciones propias, con código, título, área, versión,
 *   ronda, fecha límite y estado (pendiente, en plazo, vencida, evaluada o
 *   revocada). El estado lo deriva el servidor con su reloj.
 * * **Doble ciego:** la fila no tiene autores, filiaciones ni contacto; el
 *   tipo `ReviewerAssignmentRow` ni siquiera los declara.
 * * Solo las asignaciones activas o completadas tienen detalle; las demás se
 *   muestran sin enlace porque el servidor respondería `404`.
 * * La página vive en la URL (`page`); un valor manipulado se ignora.
 */
@Component({
  selector: 'app-assignment-list',
  imports: [
    DatePipe,
    RouterLink,
    StatusBadgeComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    ReviewerStandingComponent,
  ],
  templateUrl: './assignment-list.component.html',
  styleUrl: './assignment-list.component.scss',
})
export class AssignmentListComponent {
  protected readonly areaNames = areaNames;
  private readonly service = inject(ReviewerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** Aviso con el que otra vista devuelve al Revisor a la bandeja (por ejemplo, una liberación). */
  protected readonly flash: string =
    (this.router.getCurrentNavigation()?.extras.state?.['notice'] as string | undefined) ??
    (history.state?.['notice'] as string | undefined) ??
    '';
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly result = signal<Paginated<ReviewerAssignmentRow> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => toPage(params)),
        tap((page) => {
          this.viewState.set('loading');
          this.currentPage.set(page);
        }),
        switchMap((page) =>
          this.service.listAssignments(page, PAGE_SIZE).pipe(
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

  protected rows(): ReviewerAssignmentRow[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  protected canOpen(row: ReviewerAssignmentRow): boolean {
    return hasDetail(row);
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
}
