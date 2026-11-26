import { AcademicArea } from '../../../core/models/area.model';
import { AreaService } from '../../../core/services/area.service';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import {
  CATALOG_LANGUAGES,
  CATALOG_ORDERINGS,
  CatalogFilters,
  CatalogOrdering,
  DEFAULT_CATALOG_ORDERING,
} from '../../../core/models/catalog.model';
import { OpenWhenDirective } from '../../../shared/directives/open-when.directive';

/**
 * Formulario de búsqueda y filtros combinados del catálogo (HU-18).
 *
 * Es presentacional: recibe los filtros vigentes (los de la URL) y emite
 * los nuevos al enviar; quien lo contiene los lleva a la URL y consulta.
 * Un campo vacío no es un filtro, y la fecha «Desde» no puede ser
 * posterior a «Hasta» (el backend respondería `400`). El buscador queda a la vista y el
 * resto en un panel plegable que se abre si alguno está aplicado (spec 005, FR-017).
 */
@Component({
  selector: 'app-catalog-search',
  imports: [ReactiveFormsModule, OpenWhenDirective],
  templateUrl: './catalog-search.component.html',
  styleUrl: './catalog-search.component.scss',
})
export class CatalogSearchComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly areaService = inject(AreaService);

  /** Carreras activas del catálogo; el filtro envía `area=<code>`. */
  protected readonly areas = signal<AcademicArea[]>([]);

  /** Filtros vigentes (los de la URL); el formulario los refleja. */
  readonly filters = input<CatalogFilters>({});

  /** Filtros nuevos al buscar (sin campos vacíos). */
  readonly searched = output<CatalogFilters>();

  /** Se quitaron todos los filtros. */
  readonly cleared = output<void>();

  /** Filtros del panel que están aplicados; el texto de búsqueda queda fuera. */
  protected readonly activeFilterCount = computed(() => {
    const { search: _, ordering, ...rest } = this.filters();
    const reordered = ordering !== undefined && ordering !== DEFAULT_CATALOG_ORDERING;
    return Object.values(rest).filter(Boolean).length + (reordered ? 1 : 0);
  });

  protected readonly languages = CATALOG_LANGUAGES;
  protected readonly orderings = CATALOG_ORDERINGS;

  protected readonly form = this.formBuilder.group(
    {
      search: [''],
      area: [''],
      keyword: [''],
      language: [''],
      date_from: [''],
      date_to: [''],
      ordering: [DEFAULT_CATALOG_ORDERING as string],
    },
    {
      validators: (group) => {
        const from = group.get('date_from')?.value as string;
        const to = group.get('date_to')?.value as string;
        return from && to && from > to ? { dateRange: true } : null;
      },
    },
  );

  constructor() {
    this.areaService.list().subscribe({ next: (areas) => this.areas.set(areas) });
    effect(() => {
      const filters = this.filters();
      this.form.reset(
        {
          search: filters.search ?? '',
          area: filters.area ?? '',
          keyword: filters.keyword ?? '',
          language: filters.language ?? '',
          date_from: filters.date_from ?? '',
          date_to: filters.date_to ?? '',
          ordering: filters.ordering ?? DEFAULT_CATALOG_ORDERING,
        },
        { emitEvent: false },
      );
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const filters: CatalogFilters = {};
    for (const key of ['search', 'area', 'keyword'] as const) {
      const text = value[key].trim();
      if (text) {
        filters[key] = text;
      }
    }
    if (value.language) {
      filters.language = value.language;
    }
    if (value.date_from) {
      filters.date_from = value.date_from;
    }
    if (value.date_to) {
      filters.date_to = value.date_to;
    }
    if (value.ordering !== DEFAULT_CATALOG_ORDERING) {
      filters.ordering = value.ordering as CatalogOrdering;
    }
    this.searched.emit(filters);
  }

  protected clear(): void {
    this.cleared.emit();
  }
}
