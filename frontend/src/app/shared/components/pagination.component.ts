import { Component, computed, input, output } from '@angular/core';

/**
 * Paginación de listados con botones Anterior/Siguiente (plan §3.5).
 * El estado vive en la URL: el contenedor actualiza los `queryParams`
 * al recibir `pageChange`.
 */
@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  /** Página actual (base 1). */
  readonly page = input.required<number>();

  /** Tamaño de página solicitado al backend (máximo 100). */
  readonly pageSize = input.required<number>();

  /** Total de elementos devuelto por el backend. */
  readonly totalItems = input.required<number>();

  /** Se dispara con la página destino (base 1). */
  readonly pageChange = output<number>();

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalItems() / this.pageSize())),
  );

  protected readonly isFirst = computed(() => this.page() <= 1);

  protected readonly isLast = computed(() => this.page() >= this.totalPages());

  protected goTo(target: number): void {
    if (target >= 1 && target <= this.totalPages() && target !== this.page()) {
      this.pageChange.emit(target);
    }
  }
}
