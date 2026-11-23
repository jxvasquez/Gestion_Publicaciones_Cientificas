import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { toPage } from '../../../core/http/query-params';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  DEFAULT_NOTICE_FILTER,
  NOTICE_FILTERS,
  Notice,
  NoticeFilter,
  NoticePage,
  toNoticeFilter,
} from '../../../core/models/notification.model';
import { NotificationService } from '../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { NotificationItemComponent } from '../notification-item/notification-item.component';

/** Tamaño de página de la vista (la API admite hasta 100). */
export const PAGE_SIZE = 20;

/**
 * Avisos propios del usuario (plan sección 3.5, HU-18).
 *
 * * Lista solo los avisos del usuario autenticado, los más recientes
 *   primero; el filtro (Todos o No leídos) y la página viven en la URL
 *   (`filter`, `page`) y un valor manipulado se ignora.
 * * Marca uno o todos como leídos. El contador de la campana sale del
 *   `NotificationService` y cambia al instante, sin recargar la página.
 * * Un aviso marcado con el filtro «No leídos» sigue a la vista hasta la
 *   próxima lectura, para que la lista no se mueva bajo el puntero.
 * * Un error al marcar no cambia nada: el aviso sigue sin leer y se explica
 *   el motivo.
 */
@Component({
  selector: 'app-notification-list',
  imports: [
    RouterLink,
    NotificationItemComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './notification-list.component.html',
  styleUrl: './notification-list.component.scss',
})
export class NotificationListComponent {
  private readonly service = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filters = NOTICE_FILTERS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly unreadCount = this.service.unreadCount;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal<ApiError | null>(null);
  protected readonly filter = signal<NoticeFilter>(DEFAULT_NOTICE_FILTER);
  protected readonly currentPage = signal(1);
  protected readonly result = signal<NoticePage | null>(null);
  protected readonly actionError = signal('');
  protected readonly busyId = signal<string | null>(null);
  protected readonly busyAll = signal(false);

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => ({ filter: toNoticeFilter(params), page: toPage(params) })),
        tap(({ filter, page }) => {
          this.viewState.set('loading');
          this.actionError.set('');
          this.filter.set(filter);
          this.currentPage.set(page);
        }),
        switchMap(({ filter, page }) =>
          this.service.list(filter, page, PAGE_SIZE).pipe(
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

  protected rows(): Notice[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  protected emptyMessage(): string {
    return this.filter() === 'UNREAD' ? 'No tiene avisos sin leer.' : 'Todavía no tiene avisos.';
  }

  protected filterParams(value: NoticeFilter): Record<string, string | null> {
    return { filter: value === 'UNREAD' ? 'unread' : null, page: null };
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.retry$.next();
  }

  /** Abrir el enlace de un aviso lo da por leído; si falla, la navegación sigue igual. */
  protected open(notice: Notice): void {
    if (!notice.is_read) {
      this.markOne(notice);
    }
  }

  protected markOne(notice: Notice): void {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(notice.id);
    this.actionError.set('');
    this.service.markRead(notice).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.result.update((page) =>
          page
            ? { ...page, results: page.results.map((n) => (n.id === updated.id ? updated : n)) }
            : page,
        );
      },
      error: (error: ApiError) => {
        this.busyId.set(null);
        this.actionError.set(error.userMessage);
      },
    });
  }

  protected markAll(): void {
    if (this.busyAll()) {
      return;
    }
    this.busyAll.set(true);
    this.actionError.set('');
    this.service.markAllRead().subscribe({
      next: () => {
        this.busyAll.set(false);
        // Con «No leídos» la página queda vacía: se relee para mostrar el estado real.
        this.reload();
      },
      error: (error: ApiError) => {
        this.busyAll.set(false);
        this.actionError.set(error.userMessage);
      },
    });
  }
}
