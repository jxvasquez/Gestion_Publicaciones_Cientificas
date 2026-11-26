import { Component, computed, input } from '@angular/core';

import { Manuscript, StageState, editorialStages } from '../../../core/models/manuscript.model';

/** Lo que oye quien usa lector de pantalla: la situación no depende del color. */
const STATE_TEXT: Readonly<Record<StageState, string>> = {
  done: 'completada',
  current: 'etapa actual',
  upcoming: 'pendiente',
};

/**
 * Progreso del ciclo editorial de un manuscrito propio (spec 005, FR-011): Borrador,
 * Enviado, En revisión y Decisión. Solo usa el estado y la baja lógica, así que no
 * puede mostrar revisores, dictámenes ni puntajes.
 */
@Component({
  selector: 'app-editorial-progress',
  templateUrl: './editorial-progress.component.html',
  styleUrl: './editorial-progress.component.scss',
})
export class EditorialProgressComponent {
  readonly manuscript = input.required<Pick<Manuscript, 'status' | 'is_active'>>();

  protected readonly stateText = STATE_TEXT;
  protected readonly stages = computed(() => editorialStages(this.manuscript()));

  /** Con cambios solicitados el ciclo no avanza a un veredicto: vuelve a revisión. */
  protected readonly returnsToReview = computed(
    () => this.manuscript().is_active && this.manuscript().status === 'CHANGES_REQUESTED',
  );
}
