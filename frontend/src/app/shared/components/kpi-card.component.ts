import { Component, computed, input } from '@angular/core';

import { EmptyStateComponent } from './empty-state.component';

type KpiIcon = 'author' | 'reviewer' | 'editor' | 'admin';

interface KpiMetric {
  readonly label: string;
  readonly value: unknown;
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
    this.metrics().filter(
      ({ value }) => typeof value === 'number' && Number.isInteger(value) && value >= 0,
    ),
  );
}
