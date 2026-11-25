import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

import { ApiError } from '../../../core/models/api-error.model';
import { Paginated } from '../../../core/models/paginated.model';
import {
  RankingAdjustment,
  ReviewerStanding,
  adjustmentText,
} from '../../../core/models/reviewer.model';
import { ReviewerService } from '../../../core/services/reviewer.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { KpiCardComponent } from '../../../shared/components/kpi-card.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { PaginationComponent } from '../../../shared/components/pagination.component';

/** Tamaño de página del historial de ajustes. */
export const PAGE_SIZE = 10;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Desempeño propio del Revisor (spec 004, FR-033): puntaje, cupo «X/5 activas»,
 * evaluaciones a tiempo, vencimientos y el historial de ajustes del ranking.
 *
 * Es solo del propio revisor: ningún dato identifica a autores ni a otros revisores.
 * Cada ajuste se dice con texto y tono semántico («+10 a tiempo», «−20 vencida»), no
 * solo con color.
 */
@Component({
  selector: 'app-reviewer-standing',
  imports: [
    DatePipe,
    KpiCardComponent,
    PaginationComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './reviewer-standing.component.html',
  styleUrl: './reviewer-standing.component.scss',
})
export class ReviewerStandingComponent {
  private readonly service = inject(ReviewerService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly adjustmentText = adjustmentText;

  protected readonly standing = signal<ReviewerStanding | null>(null);
  protected readonly standingError = signal<ApiError | null>(null);
  protected readonly adjustments = signal<Paginated<RankingAdjustment> | null>(null);
  protected readonly adjustmentsError = signal<ApiError | null>(null);
  protected readonly loading = signal(true);
  protected readonly page = signal(1);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.standingError.set(null);
    this.service.standing().subscribe({
      next: (standing) => {
        this.standing.set(standing);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.standingError.set(error);
        this.loading.set(false);
      },
    });
    this.loadAdjustments(this.page());
  }

  protected loadAdjustments(page: number): void {
    this.page.set(page);
    this.adjustmentsError.set(null);
    this.service.adjustments(page, PAGE_SIZE).subscribe({
      next: (result) => this.adjustments.set(result),
      error: (error: ApiError) => this.adjustmentsError.set(error),
    });
  }

  protected rows(): RankingAdjustment[] {
    return this.adjustments()?.results ?? [];
  }

  protected tone(adjustment: RankingAdjustment): 'success' | 'danger' {
    return adjustment.delta >= 0 ? 'success' : 'danger';
  }
}
