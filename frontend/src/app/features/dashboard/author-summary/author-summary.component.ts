import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { KpiCardComponent } from '../../../shared/components/kpi-card.component';

/**
 * Resumen del rol Autor dentro del panel unificado (plan sección 3.4).
 *
 * Los datos propios (manuscritos y tareas pendientes) llegan del
 * proveedor de la sección `author` del backend, que se llena a partir
 * de la TSK-32. Esta vista solo pinta lo que recibe.
 */
@Component({
  selector: 'app-author-summary',
  imports: [KpiCardComponent, RouterLink],
  templateUrl: './author-summary.component.html',
  styleUrl: './author-summary.component.scss',
})
export class AuthorSummaryComponent {
  readonly data = input<Record<string, unknown> | null>(null);

  protected readonly entries = () =>
    Object.entries(this.data() ?? {}).map(([key, value]) => ({
      key,
      value: formatValue(value),
    }));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
