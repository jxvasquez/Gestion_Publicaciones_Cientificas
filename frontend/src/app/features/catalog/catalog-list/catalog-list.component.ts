import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  CatalogArticle,
  CatalogFilters,
  hasCatalogFilters,
  languageLabel,
  toCatalogFilters,
} from '../../../core/models/catalog.model';
import { Paginated } from '../../../core/models/paginated.model';
import { toPage } from '../../../core/http/query-params';
import { CatalogService } from '../../../core/services/catalog.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';
import { PublicHeaderComponent } from '../../../shared/components/public-header.component';
import { CatalogSearchComponent } from '../catalog-search/catalog-search.component';

/** Tamaño de página del catálogo (la API admite hasta 100). */
export const PAGE_SIZE = 12;

/** Fechas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/** Longitud máxima del resumen en la tarjeta; la ficha lo muestra completo. */
const EXCERPT_LENGTH = 280;

/**
 * Listado público del catálogo (plan sección 3.5, HU-18).
 *
 * * Es accesible sin sesión y no envía credenciales.
 * * La búsqueda, los filtros combinados, el orden y la página viven en la URL
 *   (`search`, `area`, `language`, `keyword`, `date_from`, `date_to`,
 *   `ordering`, `page`): recargar o compartir el enlace conserva la vista, y
 *   un parámetro manipulado a mano se descarta en lugar de provocar un `400`.
 * * Solo llegan artículos aceptados y activos: el backend no devuelve
 *   ningún otro, y la tarjeta solo muestra la lista blanca pública.
 */
@Component({
  selector: 'app-catalog-list',
  imports: [
    DatePipe,
    RouterLink,
    PublicHeaderComponent,
    CatalogSearchComponent,
    PaginationComponent,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  templateUrl: './catalog-list.component.html',
  styleUrl: './catalog-list.component.scss',
})
export class CatalogListComponent {
  private readonly service = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly result = signal<Paginated<CatalogArticle> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly filters = signal<CatalogFilters>({});
  protected readonly filtered = signal(false);

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([this.route.queryParamMap, this.retry$])
      .pipe(
        map(([params]) => ({ filters: toCatalogFilters(params), page: toPage(params) })),
        tap(({ filters, page }) => {
          this.viewState.set('loading');
          this.filters.set(filters);
          this.filtered.set(hasCatalogFilters(filters));
          this.currentPage.set(page);
        }),
        switchMap(({ filters, page }) =>
          this.service.list(filters, page, PAGE_SIZE).pipe(
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

  protected rows(): CatalogArticle[] {
    return this.result()?.results ?? [];
  }

  protected total(): number {
    return this.result()?.count ?? 0;
  }

  protected authors(article: CatalogArticle): string {
    return article.authors.map((author) => author.full_name).join('; ');
  }

  protected language(article: CatalogArticle): string {
    return languageLabel(article.language);
  }

  protected excerpt(article: CatalogArticle): string {
    const text = article.abstract.trim();
    return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
  }

  protected reload(): void {
    this.retry$.next();
  }

  protected search(filters: CatalogFilters): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: filters.search ?? null,
        area: filters.area ?? null,
        keyword: filters.keyword ?? null,
        language: filters.language ?? null,
        date_from: filters.date_from ?? null,
        date_to: filters.date_to ?? null,
        ordering: filters.ordering ?? null,
        page: null,
      },
    });
  }

  protected clear(): void {
    this.search({});
  }

  protected goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }
}
