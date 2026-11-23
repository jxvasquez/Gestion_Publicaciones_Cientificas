import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';

import { ApiError, toApiError } from '../../../core/models/api-error.model';
import {
  EligibilityDiagnosis,
  EligibleReviewer,
  isAtCapacity,
} from '../../../core/models/editor.model';
import { EditorService } from '../../../core/services/editor.service';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';

let nextId = 0;

/**
 * Explicación en español de por qué no hay Revisores elegibles.
 *
 * Cada línea es una causa concreta con su cifra; nunca queda una lista
 * vacía sin explicación. Las causas son exclusivas y suman `reviewers`.
 */
export function explainNoReviewers(
  diagnosis: EligibilityDiagnosis | undefined,
  area?: string,
): string[] {
  if (!diagnosis) {
    return ['No se pudo determinar la causa; intente de nuevo.'];
  }
  if (diagnosis.reviewers === 0) {
    return ['No hay cuentas con el rol de Revisor activo en el sistema.'];
  }
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const causes: string[] = [];
  if (diagnosis.other_area > 0) {
    causes.push(
      `${plural(diagnosis.other_area, 'no declara', 'no declaran')} el área ` +
        `${area ? `«${area}»` : 'del manuscrito'}.`,
    );
  }
  if (diagnosis.unavailable > 0) {
    causes.push(
      `${plural(diagnosis.unavailable, 'marcó', 'marcaron')} que no ` +
        `${diagnosis.unavailable === 1 ? 'está disponible' : 'están disponibles'}.`,
    );
  }
  if (diagnosis.conflict > 0) {
    causes.push(
      `${plural(diagnosis.conflict, 'figura', 'figuran')} como ` +
        `${diagnosis.conflict === 1 ? 'autor' : 'autores'} del manuscrito (conflicto de interés).`,
    );
  }
  if (diagnosis.no_profile > 0) {
    causes.push(
      `${plural(diagnosis.no_profile, 'no tiene', 'no tienen')} perfil de revisor con áreas y disponibilidad.`,
    );
  }
  return [
    `Hay ${plural(diagnosis.reviewers, 'Revisor con cuenta activa', 'Revisores con cuenta activa')}, ` +
      'pero ninguno es elegible:',
    ...causes,
  ];
}

/**
 * Selector de Revisores elegibles para un manuscrito (plan sección 3.5, HU-11).
 *
 * * Lista a quienes tienen cuenta y rol activos, están disponibles,
 *   declaran el área del manuscrito y no figuran como autores: esas
 *   reglas las aplica el servidor y la interfaz no las repite.
 * * Muestra para cada uno sus áreas y su carga (`activas de máximo`); con
 *   la carga completa no se puede seleccionar, porque la asignación sería
 *   rechazada.
 * * Si no queda ninguno, explica la causa con las cifras del diagnóstico.
 * * La búsqueda filtra la lista ya cargada por nombre, correo, código
 *   institucional o área.
 * * Es presentacional: emite `selected` y quien lo usa decide qué hacer.
 */
@Component({
  selector: 'app-reviewer-picker',
  imports: [FormsModule, LoadingSpinnerComponent, ErrorStateComponent],
  templateUrl: './reviewer-picker.component.html',
  styleUrl: './reviewer-picker.component.scss',
})
export class ReviewerPickerComponent {
  private readonly service = inject(EditorService);

  /** Manuscrito para el que se buscan Revisores. */
  readonly manuscriptId = input.required<string>();

  /** Área del manuscrito, solo para redactar la explicación. */
  readonly area = input('');

  /** Bloquea la selección mientras hay una acción en curso. */
  readonly disabled = input(false);

  /** Se dispara al seleccionar a un Revisor. */
  readonly selected = output<EligibleReviewer>();

  protected readonly titleId = `reviewer-picker-title-${nextId}`;
  protected readonly searchId = `reviewer-picker-search-${nextId++}`;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal<ApiError | null>(null);
  protected readonly reviewers = signal<EligibleReviewer[]>([]);
  protected readonly diagnosis = signal<EligibilityDiagnosis | undefined>(undefined);
  protected readonly query = signal('');

  protected readonly visible = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) {
      return this.reviewers();
    }
    return this.reviewers().filter((reviewer) =>
      [reviewer.full_name, reviewer.email, reviewer.institutional_id, ...reviewer.expertise_areas]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  });

  protected readonly explanation = computed(() =>
    explainNoReviewers(this.diagnosis(), this.area() || undefined),
  );

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([toObservable(this.manuscriptId), this.retry$])
      .pipe(
        map(([id]) => id),
        tap(() => this.viewState.set('loading')),
        switchMap((id) =>
          this.service.listEligibleReviewers(id).pipe(
            map((page) => ({ page, error: null as ApiError | null })),
            catchError((error: unknown) => of({ page: null, error: toApiError(error) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ page, error }) => {
        this.reviewers.set(page?.results ?? []);
        this.diagnosis.set(page?.diagnosis);
        this.error.set(error);
        this.viewState.set(error ? 'error' : 'ready');
      });
  }

  protected atCapacity(reviewer: EligibleReviewer): boolean {
    return isAtCapacity(reviewer);
  }

  protected reload(): void {
    this.retry$.next();
  }
}
