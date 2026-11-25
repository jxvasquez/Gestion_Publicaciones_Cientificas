import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap, tap } from 'rxjs';

import { UnsavedChangesAware } from '../../../core/auth/unsaved-changes.guard';
import { ApiError } from '../../../core/models/api-error.model';
import {
  COMMENT_MAX_LENGTH,
  ConflictResult,
  EvaluationSnapshot,
  MAX_SCORE,
  MIN_SCORE,
  ReviewerAssignmentDetail,
  ReviewerEvaluation,
} from '../../../core/models/reviewer.model';
import {
  JUSTIFICATION_MIN_LENGTH,
  RECOMMENDATION_OPTIONS,
  RUBRIC_CRITERIA,
  RUBRIC_KEYS,
  Recommendation,
  RubricKey,
  characterCount,
} from '../../../core/models/rubric.model';
import { ReviewerService } from '../../../core/services/reviewer.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { ConflictDialogComponent } from '../conflict-dialog/conflict-dialog.component';
import { DeadlineCountdownComponent } from '../deadline-countdown/deadline-countdown.component';
import { IdentityLeakDialogComponent } from '../identity-leak-dialog/identity-leak-dialog.component';
import {
  EMPTY_VALUES,
  EvaluationErrors,
  EvaluationField,
  EvaluationValues,
  isDirty,
  justificationRequired,
  serverFieldErrors,
  submitErrors,
  toDraft,
  toValues,
} from './evaluation-form.rules';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

const SUBMITTED_NOTICE = 'Esta evaluación ya fue enviada y no admite cambios.';
const CONFLICT_NOTICE =
  'Declaró un conflicto de interés: la asignación se liberó sin penalización y la evaluación está bloqueada.';
const OVERDUE_NOTICE =
  'El plazo de evaluación venció. Su texto sigue en pantalla y el último borrador guardado se conserva, pero ya no puede guardarse ni enviarse.';

let nextId = 0;

/**
 * Formulario de evaluación estructurado (plan sección 3.5, HU-15 y HU-16).
 *
 * * Rúbrica de cinco criterios (1–5, cada nivel con su nombre y descriptor), uno de
 *   cuatro dictámenes, comentarios para el Autor y la declaración de no tener
 *   conflicto de interés. Los comentarios exigen 100 caracteres cuando algún criterio
 *   es 3 o menos o el dictamen es Revisión mayor o Rechazar (contador visible solo
 *   entonces). El borrador se guarda con huecos y es privado. El envío final es
 *   irreversible, por eso pide confirmación.
 * * Bloqueo optimista: el `ETag` de la última lectura viaja en `If-Match`.
 *   Un `409` por versión no borra nada: el Revisor elige entre usar lo
 *   guardado o conservar su texto sobre la versión más reciente. Un `409`
 *   de estado o un `410` (plazo vencido, asignación revocada, evaluación ya
 *   enviada) bloquean los campos pero **dejan el texto a la vista**.
 * * Si había cambios sin guardar, «Enviar» los guarda primero y envía con
 *   el `ETag` resultante. Si el guardado falla, no se envía nada.
 * * El contador cuenta contra el plazo del backend y al vencer bloquea
 *   guardado y envío; el corte definitivo lo aplica el servidor.
 * * Implementa `UnsavedChangesAware`: el `unsavedChangesGuard` advierte
 *   antes de abandonar el formulario con cambios sin guardar.
 */
@Component({
  selector: 'app-evaluation-form',
  imports: [
    DatePipe,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    DeadlineCountdownComponent,
    ConflictDialogComponent,
    IdentityLeakDialogComponent,
  ],
  templateUrl: './evaluation-form.component.html',
  styleUrl: './evaluation-form.component.scss',
})
export class EvaluationFormComponent implements UnsavedChangesAware {
  private readonly service = inject(ReviewerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly assignmentId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly criteria = RUBRIC_CRITERIA;
  protected readonly recommendations = RECOMMENDATION_OPTIONS;
  protected readonly min = MIN_SCORE;
  protected readonly max = MAX_SCORE;
  protected readonly commentMax = COMMENT_MAX_LENGTH;
  protected readonly justificationMin = JUSTIFICATION_MIN_LENGTH;

  private readonly uid = nextId++;
  protected readonly counterId = `evaluation-counter-${this.uid}`;
  protected readonly declarationId = `evaluation-declaration-${this.uid}`;
  protected readonly declarationErrorId = `evaluation-declaration-error-${this.uid}`;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<ApiError | null>(null);
  protected readonly assignment = signal<ReviewerAssignmentDetail | null>(null);
  protected readonly serverOffsetMs = signal(0);

  /** Último estado del servidor: sus marcas (`FINAL`, conflicto) mandan sobre lo local. */
  protected readonly evaluation = signal<ReviewerEvaluation>(emptyEvaluation());
  private readonly etag = signal<string | null>(null);

  protected readonly values = signal<EvaluationValues>(EMPTY_VALUES);
  /** Lo último guardado en el servidor; contra esto se mide «sin guardar». */
  private readonly saved = signal<EvaluationValues>(EMPTY_VALUES);
  protected readonly declared = signal(false);

  protected readonly attempted = signal(false);
  protected readonly serverErrors = signal<EvaluationErrors>({});
  protected readonly saving = signal(false);
  protected readonly submitting = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly actionError = signal('');
  protected readonly savedNotice = signal('');

  /** El servidor rechazó por versión (`409`): hay otra versión guardada. */
  protected readonly stale = signal(false);
  /** Mensaje de un rechazo definitivo (`409` de estado o `410`): el formulario queda bloqueado. */
  private readonly serverLock = signal<string | null>(null);
  protected readonly deadlinePassed = signal(false);

  protected readonly busy = computed(() => this.saving() || this.submitting());

  protected readonly submitted = computed(
    () => this.evaluation().status === 'FINAL' || this.assignment()?.status === 'COMPLETED',
  );

  /** Por qué el formulario no admite cambios, si no los admite. */
  protected readonly lockNotice = computed<string | null>(() => {
    if (this.submitted()) {
      return this.evaluation().submitted_at ? null : SUBMITTED_NOTICE;
    }
    if (this.evaluation().conflict_declared) {
      return CONFLICT_NOTICE;
    }
    const lock = this.serverLock();
    if (lock !== null) {
      return lock;
    }
    return this.overdue() ? OVERDUE_NOTICE : null;
  });

  private readonly overdue = computed(
    () => this.deadlinePassed() || this.assignment()?.is_overdue === true,
  );

  protected readonly readOnly = computed(
    () => this.lockNotice() !== null || this.submitted() || this.busy(),
  );

  protected readonly dirty = computed(() => isDirty(this.values(), this.saved()));

  /** El contador «N/100» solo aparece cuando FR-019 exige justificación. */
  protected readonly needsJustification = computed(() => justificationRequired(this.values()));

  protected readonly commentLength = computed(() =>
    characterCount(this.values().comments_for_author),
  );

  protected readonly canSave = computed(() => !this.readOnly() && !this.stale() && this.dirty());

  protected readonly canSubmit = computed(() => !this.readOnly() && !this.stale());

  /** Solo una asignación activa y aún sin enviar admite conflicto o reporte (lo exige el servidor). */
  protected readonly canReport = computed(
    () => this.assignment()?.status === 'ACTIVE' && !this.submitted() && !this.busy(),
  );

  protected readonly canDeclareConflict = computed(
    () => this.canReport() && !this.evaluation().conflict_declared,
  );

  protected readonly conflictOpen = signal(false);
  protected readonly leakOpen = signal(false);
  protected readonly leakNotice = signal('');

  private readonly localErrors = computed<EvaluationErrors>(() =>
    this.attempted() ? submitErrors(this.values(), this.declared()) : {},
  );

  protected readonly errors = computed<EvaluationErrors>(() => ({
    ...this.localErrors(),
    ...this.serverErrors(),
  }));

  /** Resumen de errores en el orden del formulario, para enlazarlos. */
  protected readonly summary = computed(() => {
    const errors = this.errors();
    const order: (EvaluationField | 'declaration')[] = [
      ...RUBRIC_KEYS,
      'recommendation',
      'comments_for_author',
      'declaration',
    ];
    return order
      .filter((field) => errors[field])
      .map((field) => ({ id: this.fieldId(field), message: errors[field] as string }));
  });

  constructor() {
    this.load();
  }

  hasUnsavedChanges(): boolean {
    return !this.submitted() && this.dirty();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    forkJoin({
      assignment: this.service.getAssignment(this.assignmentId),
      evaluation: this.service.getEvaluation(this.assignmentId),
    }).subscribe({
      next: ({ assignment, evaluation }) => {
        this.assignment.set(assignment.assignment);
        this.serverOffsetMs.set(assignment.serverOffsetMs);
        this.adopt(evaluation);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected fieldId(field: EvaluationField | 'declaration'): string {
    return field === 'declaration' ? this.declarationId : `evaluation-${field}-${this.uid}`;
  }

  protected errorId(field: EvaluationField): string {
    return `${this.fieldId(field)}-error`;
  }

  protected hintId(field: EvaluationField): string {
    return `${this.fieldId(field)}-hint`;
  }

  protected errorOf(field: EvaluationField | 'declaration'): string | undefined {
    return this.errors()[field];
  }

  protected describedBy(field: EvaluationField): string | null {
    const ids = [
      field === 'comments_for_author' || RUBRIC_KEYS.includes(field as RubricKey)
        ? this.hintId(field)
        : null,
      field === 'comments_for_author' && this.needsJustification() ? this.counterId : null,
      this.errorOf(field) ? this.errorId(field) : null,
    ].filter((id) => id !== null);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  protected focus(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.focus();
  }

  protected setScore(field: RubricKey, score: number): void {
    this.edit({ ...this.values(), [field]: score }, field);
  }

  protected setRecommendation(value: Recommendation): void {
    this.edit({ ...this.values(), recommendation: value }, 'recommendation');
  }

  protected setText(value: string): void {
    this.edit({ ...this.values(), comments_for_author: value }, 'comments_for_author');
  }

  private edit(next: EvaluationValues, field: EvaluationField): void {
    this.values.set(next);
    this.savedNotice.set('');
    this.actionError.set('');
    if (this.serverErrors()[field]) {
      this.serverErrors.update(({ [field]: _removed, ...rest }) => rest);
    }
  }

  /** Guarda el borrador tal como esté: los huecos son válidos. */
  protected saveDraft(): void {
    const etag = this.etag();
    if (!this.canSave() || etag === null) {
      return;
    }
    this.saving.set(true);
    this.actionError.set('');
    this.service.saveDraft(this.assignmentId, toDraft(this.values()), etag).subscribe({
      next: (snapshot) => {
        this.saving.set(false);
        this.adopt(snapshot);
        this.savedNotice.set('Borrador guardado.');
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        this.onWriteError(error);
      },
    });
  }

  /** Valida lo que exige el envío final y pide confirmación. */
  protected requestSubmit(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.attempted.set(true);
    this.actionError.set('');
    if (Object.keys(this.localErrors()).length > 0) {
      return;
    }
    this.confirmOpen.set(true);
  }

  /** Guarda lo pendiente y envía con el `ETag` resultante; si guardar falla, no envía. */
  protected send(): void {
    this.confirmOpen.set(false);
    const etag = this.etag();
    if (!this.canSubmit() || etag === null) {
      return;
    }
    this.submitting.set(true);
    this.actionError.set('');
    const saved$ = this.dirty()
      ? this.service.saveDraft(this.assignmentId, toDraft(this.values()), etag).pipe(
          tap((snapshot) => this.adopt(snapshot)),
          map((snapshot) => snapshot.etag ?? etag),
        )
      : of(etag);
    saved$
      .pipe(switchMap((current) => this.service.submitEvaluation(this.assignmentId, current)))
      .subscribe({
        next: (snapshot) => {
          this.submitting.set(false);
          this.adopt(snapshot);
          this.savedNotice.set('');
        },
        error: (error: ApiError) => {
          this.submitting.set(false);
          this.onWriteError(error);
        },
      });
  }

  /**
   * El servidor liberó la asignación sin penalización: ya no es del Revisor, así que
   * vuelve a la bandeja con el aviso (el detalle respondería 404).
   */
  protected onConflictDeclared(_result: ConflictResult): void {
    this.conflictOpen.set(false);
    void this.router.navigate(['/app/reviewer/assignments'], {
      state: {
        notice:
          'Conflicto de interés declarado: la asignación se liberó sin penalización y se cubrirá con otro revisor.',
      },
    });
  }

  protected onLeakReported(): void {
    this.leakOpen.set(false);
    this.leakNotice.set(
      'Reporte confidencial enviado. Solo el Administrador lo verá y su evaluación no cambió.',
    );
  }

  /** «Conservar mi texto»: toma el `ETag` vigente y deja que el Revisor vuelva a guardar. */
  protected keepMine(): void {
    this.service.getEvaluation(this.assignmentId).subscribe({
      next: (snapshot) => {
        this.etag.set(snapshot.etag);
        this.evaluation.set(snapshot.evaluation);
        this.stale.set(false);
        this.savedNotice.set('Ya puede guardar sus cambios sobre la versión más reciente.');
      },
      error: (error: ApiError) => this.actionError.set(error.userMessage),
    });
  }

  /** «Usar la versión guardada»: descarta el texto local a petición expresa del Revisor. */
  protected useSaved(): void {
    this.service.getEvaluation(this.assignmentId).subscribe({
      next: (snapshot) => {
        this.adopt(snapshot);
        this.stale.set(false);
        this.serverErrors.set({});
        this.attempted.set(false);
      },
      error: (error: ApiError) => this.actionError.set(error.userMessage),
    });
  }

  /** Toma lo que dice el servidor como lo último guardado. */
  private adopt(snapshot: EvaluationSnapshot): void {
    const values = toValues(snapshot.evaluation);
    this.evaluation.set(snapshot.evaluation);
    this.etag.set(snapshot.etag);
    this.values.set(values);
    this.saved.set(values);
    this.serverErrors.set({});
  }

  private onWriteError(error: ApiError): void {
    if (error.status === 409 && error.code === 'VERSION_CONFLICT') {
      this.stale.set(true);
      return;
    }
    if (error.status === 410) {
      this.serverLock.set(OVERDUE_NOTICE);
      return;
    }
    if (error.status === 409) {
      this.serverLock.set(error.message || error.userMessage);
      return;
    }
    if (error.status === 400) {
      this.serverErrors.set(serverFieldErrors(error.details));
      this.attempted.set(true);
      this.actionError.set(error.userMessage);
      return;
    }
    this.actionError.set(error.userMessage);
  }
}

function emptyEvaluation(): ReviewerEvaluation {
  return {
    id: null,
    status: 'DRAFT',
    rubric_version: 2,
    scientific_contribution: null,
    methodological_rigor: null,
    literature_grounding: null,
    results_conclusions: null,
    academic_writing: null,
    recommendation: null,
    comments_for_author: null,
    conflict_declared: false,
    submitted_at: null,
  };
}
