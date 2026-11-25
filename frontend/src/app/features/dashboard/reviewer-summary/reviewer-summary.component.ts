import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { KpiCardComponent } from '../../../shared/components/kpi-card.component';

/**
 * Resumen del rol Revisor dentro del panel unificado (plan sección 3.4).
 *
 * Muestra el puntaje de ranking, el cupo «X/5 activas», las evaluaciones a tiempo
 * y los vencimientos (FR-033, FR-038). Los datos llegan de la sección `reviewer`
 * del backend y nunca incluyen identidad de Autores ni de otros revisores.
 */
@Component({
  selector: 'app-reviewer-summary',
  imports: [KpiCardComponent, RouterLink],
  templateUrl: './reviewer-summary.component.html',
  styleUrl: './reviewer-summary.component.scss',
})
export class ReviewerSummaryComponent {
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
