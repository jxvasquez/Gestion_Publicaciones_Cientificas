import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { KpiCardComponent } from '../../../shared/components/kpi-card.component';

/**
 * Resumen del rol Editor dentro del panel unificado (plan sección 3.4).
 *
 * Muestra nuevos envíos y asignaciones vencidas; los datos llegan del
 * proveedor de la sección `editor` del backend, que se llena a partir
 * de la TSK-47.
 */
@Component({
  selector: 'app-editor-summary',
  imports: [KpiCardComponent, RouterLink],
  templateUrl: './editor-summary.component.html',
  styleUrl: './editor-summary.component.scss',
})
export class EditorSummaryComponent {
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
