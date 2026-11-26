import { Component, computed, input } from '@angular/core';

import { EmptyStateComponent } from './empty-state.component';

/** Símbolos del sprite `icons/ui.svg` que usan las tarjetas. */
type KpiIcon = 'author' | 'reviewer' | 'admin' | 'incident' | 'hourglass';

/**
 * Una métrica de la tarjeta. Con `max` se muestra «X/Y» y su nombre accesible
 * es «X de Y» (por ejemplo «3/5» activas); sin `max` se muestra igual que antes.
 * `icon` añade un dibujo decorativo junto a la etiqueta.
 */
interface KpiMetric {
  readonly label: string;
  readonly value: unknown;
  readonly max?: unknown;
  readonly icon?: KpiIcon;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [EmptyStateComponent],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss',
})
export class KpiCardComponent {
  readonly title = input.required<string>();
  readonly icon = input.required<KpiIcon>();
  readonly metrics = input<readonly KpiMetric[]>([]);

  protected readonly counts = computed(() =>
    this.metrics()
      .filter(({ value }) => isCount(value))
      .map(({ label, value, max, icon }) => ({
        label,
        icon,
        value: value as number,
        // Un máximo que no es un entero no negativo se ignora: la métrica se muestra sin él.
        max: isCount(max) ? max : null,
      })),
  );
}
