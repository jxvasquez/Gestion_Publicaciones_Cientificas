import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { KpiCardComponent } from '../../../shared/components/kpi-card.component';

/**
 * Resumen del rol Administrador dentro del panel unificado
 * (plan sección 3.4). Muestra la vista de auditoría y la habilitación
 * de corrección de veredicto; los datos llegan del proveedor de la
 * sección `admin` del backend, que se llena a partir de la TSK-73.
 */
@Component({
  selector: 'app-admin-summary',
  imports: [KpiCardComponent, RouterLink],
  templateUrl: './admin-summary.component.html',
  styleUrl: './admin-summary.component.scss',
})
export class AdminSummaryComponent {
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
