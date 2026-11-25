import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { toPage } from '../../../core/http/query-params';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  AcademicArea,
  RosterChanges,
  RosterParams,
  RosterReviewer,
} from '../../../core/models/area.model';
import { Paginated } from '../../../core/models/paginated.model';
import { AdminService } from '../../../core/services/admin.service';
import { AreaService } from '../../../core/services/area.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { ReviewerEditDialogComponent } from '../reviewer-edit-dialog/reviewer-edit-dialog.component';

export const PAGE_SIZE = 20;

/**
 * Padrón de revisores (spec 004, FR-009): tabla con carreras, disponibilidad y métricas
 * de ranking y carga, con filtros por carrera, disponibilidad y búsqueda. Los filtros y
 * la página viven en la URL; un valor manipulado se ignora. Editar carreras o
 * disponibilidad abre un diálogo y no altera las asignaciones vigentes.
 */
@Component({
  selector: 'app-reviewer-roster',
  imports: [
    FormsModule,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    ReviewerEditDialogComponent,
  ],
  templateUrl: './reviewer-roster.component.html',
  styleUrl: './reviewer-roster.component.scss',
})
export class ReviewerRosterComponent {
  private readonly service = inject(AdminService);
  private readonly areaService = inject(AreaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly result = signal<Paginated<RosterReviewer> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly filters = signal<RosterParams>({});
  protected readonly search = signal('');
  protected readonly areaOptions = signal<AcademicArea[]>([]);

  protected readonly editing = signal<RosterReviewer | null>(null);
  protected readonly saving = signal(false);
  protected readonly editError = signal('');
  protected readonly notice = signal('');

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    this.areaService.list().subscribe({ next: (areas) => this.areaOptions.set(areas) });
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => ({
          page: toPage(params),
          area: params.get('area') ?? undefined,
          available:
            params.get('available') === 'true'
              ? true
              : params.get('available') === 'false'
                ? false
                : undefined,
          search: params.get('search') ?? undefined,
        })),
        tap((query) => {
          this.viewState.set('loading');
          this.currentPage.set(query.page);
          this.filters.set({ area: query.area, available: query.available, search: query.search });
          this.search.set(query.search ?? '');
        }),
        switchMap((query) =>
          this.service.listReviewers({ ...query, page_size: PAGE_SIZE }).pipe(
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

  protected rows(): RosterReviewer[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  protected reload(): void {
    this.retry$.next();
  }

  protected applyFilter(change: Partial<Record<'area' | 'available' | 'search', string | null>>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...change, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  protected areaNames(row: RosterReviewer): string {
    return row.areas.map((area) => area.name).join(', ') || 'Sin carreras';
  }

  protected edit(row: RosterReviewer): void {
    this.notice.set('');
    this.editError.set('');
    this.editing.set(row);
  }

  protected save(changes: RosterChanges): void {
    const row = this.editing();
    if (row === null || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.editError.set('');
    this.service.updateReviewer(row.id, changes).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.editing.set(null);
        this.notice.set(`Se actualizó a ${updated.full_name}.`);
        this.result.update((page) =>
          page
            ? { ...page, results: page.results.map((r) => (r.id === updated.id ? updated : r)) }
            : page,
        );
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        this.editError.set(error.userMessage);
      },
    });
  }
}
