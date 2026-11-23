import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, catchError, combineLatest, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { newIdempotencyKey } from '../../../core/http/idempotency-key';
import { ApiError, toApiError } from '../../../core/models/api-error.model';
import { DECISION_LABELS } from '../../../core/models/audit.model';
import {
  CorrectionAuthorization,
  EditorEvaluation,
  RECOMMENDATION_LABELS,
  Recommendation,
  Verdict,
  VerdictDecision,
  VerdictRegistered,
  VerdictRequest,
  departsFromRecommendation,
} from '../../../core/models/editor.model';
import { EditorService } from '../../../core/services/editor.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';

/** Máximo de cada texto que acepta la API. */
export const VERDICT_TEXT_MAX_LENGTH = 5000;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/** Códigos de conflicto tras los cuales lo que el Editor ve ya no es lo vigente. */
const STALE_CODES = [
  'STATE_CONFLICT',
  'VERSION_CONFLICT',
  'VERDICT_CONFLICT',
  'CORRECTION_NOT_AUTHORIZED',
];

let nextId = 0;

/** Las opciones de decisión, con el color que la constitución asigna a cada acción. */
export const DECISION_OPTIONS: readonly {
  value: VerdictDecision;
  label: string;
  hint: string;
  tone: 'success' | 'danger' | 'warning';
}[] = [
  {
    value: 'ACCEPTED',
    label: 'Aceptado',
    hint: 'El artículo se publica de inmediato en el catálogo público.',
    tone: 'success',
  },
  {
    value: 'REQUIRES_CORRECTIONS',
    label: 'Requiere correcciones',
    hint: 'Se abre la siguiente ronda para que el Autor envíe una nueva versión.',
    tone: 'warning',
  },
  {
    value: 'REJECTED',
    label: 'Rechazado',
    hint: 'El manuscrito no se publica.',
    tone: 'danger',
  },
];

export interface VerdictFormValue {
  decision: VerdictDecision | null;
  justification: string;
  observations: string;
}

export interface VerdictFormErrors {
  decision?: string;
  justification?: string;
  observations?: string;
}

/** La justificación es obligatoria al rechazar o al apartarse de la recomendación. */
export function justificationRequired(
  decision: VerdictDecision | null,
  recommendation: Recommendation | null,
): boolean {
  if (decision === null) {
    return false;
  }
  return (
    decision === 'REJECTED' ||
    (recommendation !== null && departsFromRecommendation(decision, recommendation))
  );
}

/**
 * Validación del formulario, espejo de las reglas del servidor (HU-13):
 * decisión obligatoria; justificación al rechazar o al apartarse de la
 * recomendación del Revisor; observaciones al pedir correcciones.
 */
export function verdictFormErrors(
  value: VerdictFormValue,
  recommendation: Recommendation | null,
): VerdictFormErrors {
  const errors: VerdictFormErrors = {};
  if (value.decision === null) {
    errors.decision = 'Seleccione una decisión.';
    return errors;
  }
  if (justificationRequired(value.decision, recommendation) && value.justification.trim() === '') {
    errors.justification =
      value.decision === 'REJECTED'
        ? 'Indique la justificación del rechazo.'
        : 'Justifique por qué se aparta de la recomendación del Revisor.';
  }
  if (value.decision === 'REQUIRES_CORRECTIONS' && value.observations.trim() === '') {
    errors.observations = 'Indique las observaciones para el Autor.';
  }
  return errors;
}

/**
 * Evaluación final del Revisor y veredicto del Editor (plan sección 3.5,
 * HU-13).
 *
 * * Muestra la evaluación final de la versión vigente —con la identidad del
 *   Revisor y los comentarios confidenciales, que solo el Editor ve— y la
 *   **recomendación en solo lectura**: el Editor decide, no la edita.
 * * Ofrece Aceptado, Requiere correcciones o Rechazado. Exige la
 *   justificación al rechazar o al apartarse de la recomendación (y lo
 *   advierte), y las observaciones al pedir correcciones. Con campos
 *   obligatorios vacíos no se envía nada.
 * * Pide confirmación antes de registrar: un veredicto no se puede editar.
 * * Los veredictos registrados se listan **solo en lectura**: no hay forma
 *   de editarlos ni de sobrescribirlos desde la interfaz, y con la versión
 *   ya juzgada el formulario desaparece.
 * * Con una autorización de corrección activa (CA-HU-13-12) muestra el
 *   veredicto que sustituiría, con su fecha, y habilita el formulario aunque
 *   la versión ya esté juzgada. El formulario nace vacío: el veredicto
 *   original no se precarga ni se modifica, y la nueva decisión se suma al
 *   historial. Al registrarla la autorización se consume y la acción
 *   desaparece. El cliente nunca envía el veredicto anterior: el servidor lo
 *   deriva de la autorización.
 * * Envía `If-Match` con el `ETag` del manuscrito e `Idempotency-Key`: un
 *   reintento tras un corte de red devuelve lo ya registrado, y la clave
 *   cambia si el Editor modifica el contenido.
 */
@Component({
  selector: 'app-verdict-form',
  imports: [
    DatePipe,
    FormsModule,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    StatusBadgeComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './verdict-form.component.html',
  styleUrl: './verdict-form.component.scss',
})
export class VerdictFormComponent {
  private readonly service = inject(EditorService);

  /** Manuscrito que se juzga. */
  readonly manuscriptId = input.required<string>();

  /** Versión vigente: la que evalúa el Revisor y la que se juzga. */
  readonly version = input.required<number>();

  /** `ETag` del manuscrito al leerlo; viaja en `If-Match`. */
  readonly etag = input<string | null>(null);

  /** El manuscrito está en revisión y activo: solo entonces se puede registrar. */
  readonly canRegister = input(false);

  /** Autorización administrativa activa para decidir de nuevo, si la hay (CA-HU-13-12). */
  readonly correction = input<CorrectionAuthorization | null>(null);

  /** Se dispara cuando el veredicto quedó registrado. */
  readonly registered = output<VerdictRegistered>();

  /** Lo que el Editor ve ya no es lo vigente (otro Editor actuó): hay que releer el detalle. */
  readonly stale = output<void>();

  protected readonly options = DECISION_OPTIONS;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly maxLength = VERDICT_TEXT_MAX_LENGTH;
  protected readonly titleId = `verdict-title-${nextId}`;
  protected readonly historyId = `verdict-history-${nextId}`;
  protected readonly justificationId = `verdict-justification-${nextId}`;
  protected readonly justificationErrorId = `verdict-justification-error-${nextId}`;
  protected readonly observationsId = `verdict-observations-${nextId}`;
  protected readonly observationsErrorId = `verdict-observations-error-${nextId++}`;

  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal<ApiError | null>(null);
  private readonly evaluations = signal<EditorEvaluation[]>([]);
  protected readonly verdicts = signal<Verdict[]>([]);

  protected readonly decision = signal<VerdictDecision | null>(null);
  protected readonly justification = signal('');
  protected readonly observations = signal('');
  private readonly attempted = signal(false);
  protected readonly confirmOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly submitError = signal('');

  /** Identifica esta intención de veredicto; cambia si el Editor modifica el contenido. */
  private idempotencyKey: string | null = null;

  /** Evaluación final de la versión vigente. */
  protected readonly evaluation = computed(
    () => this.evaluations().find((ev) => ev.version_number === this.version()) ?? null,
  );

  protected readonly recommendation = computed<Recommendation | null>(
    () => this.evaluation()?.recommendation ?? null,
  );

  protected readonly recommendationLabel = computed(() => {
    const recommendation = this.recommendation();
    return recommendation ? RECOMMENDATION_LABELS[recommendation] : '—';
  });

  protected readonly scores = computed(() => {
    const ev = this.evaluation();
    return [
      { label: 'Originalidad', value: ev?.originality_score ?? null },
      { label: 'Metodología', value: ev?.methodology_score ?? null },
      { label: 'Claridad', value: ev?.clarity_score ?? null },
      { label: 'Relevancia', value: ev?.relevance_score ?? null },
      { label: 'Ética', value: ev?.ethics_score ?? null },
    ];
  });

  /**
   * La autorización que aún se puede usar: deja de serlo en cuanto el historial
   * contiene la decisión que sustituye al veredicto autorizado, aunque el
   * contenedor todavía no haya releído el detalle.
   */
  protected readonly activeCorrection = computed(() => {
    const authorization = this.correction();
    const consumed = this.verdicts().some((v) => v.previous_verdict === authorization?.verdict_id);
    return authorization !== null && !consumed ? authorization : null;
  });

  /** El veredicto que la corrección sustituiría. */
  protected readonly originalVerdict = computed(
    () => this.verdicts().find((v) => v.id === this.activeCorrection()?.verdict_id) ?? null,
  );

  /** Veredictos ya sustituidos por una decisión corregida (siguen en el historial, solo lectura). */
  protected readonly superseded = computed(
    () => new Set(this.verdicts().flatMap((v) => (v.previous_verdict ? [v.previous_verdict] : []))),
  );

  /** Ya existe el veredicto normal de la versión vigente: no se vuelve a juzgar. */
  private readonly judged = computed(() =>
    this.verdicts().some((v) => v.version_number === this.version() && v.previous_verdict === null),
  );

  protected readonly showForm = computed(
    () =>
      this.canRegister() &&
      this.evaluation() !== null &&
      (this.activeCorrection() !== null || !this.judged()),
  );

  protected readonly departs = computed(() => {
    const decision = this.decision();
    const recommendation = this.recommendation();
    return (
      decision !== null &&
      recommendation !== null &&
      departsFromRecommendation(decision, recommendation)
    );
  });

  protected readonly needsJustification = computed(() =>
    justificationRequired(this.decision(), this.recommendation()),
  );

  protected readonly errors = computed<VerdictFormErrors>(() =>
    this.attempted()
      ? verdictFormErrors(
          {
            decision: this.decision(),
            justification: this.justification(),
            observations: this.observations(),
          },
          this.recommendation(),
        )
      : {},
  );

  protected readonly confirmMessage = computed(() => {
    const original = this.originalVerdict();
    const base = original
      ? `Sustituirá a la decisión «${DECISION_LABELS[original.decision]}», que se conserva en el historial. ` +
        'La nueva decisión no se puede editar ni sobrescribir una vez registrada. '
      : 'El veredicto no se puede editar ni sobrescribir una vez registrado. ';
    switch (this.decision()) {
      case 'ACCEPTED':
        return `${base}El manuscrito pasará a «Aceptado» y se publicará de inmediato en el catálogo público.`;
      case 'REJECTED':
        return `${base}El manuscrito pasará a «Rechazado» y no se publicará.`;
      case 'REQUIRES_CORRECTIONS':
        return `${base}El manuscrito pasará a «Requiere correcciones» y se abrirá la siguiente ronda para que el Autor envíe una nueva versión.`;
      default:
        return base;
    }
  });

  private readonly retry$ = new BehaviorSubject<void>(undefined);

  constructor() {
    combineLatest([toObservable(this.manuscriptId), toObservable(this.version), this.retry$])
      .pipe(
        map(([id]) => id),
        tap(() => this.viewState.set('loading')),
        switchMap((id) =>
          forkJoin({
            evaluations: this.service.listEvaluations(id),
            verdicts: this.service.listVerdicts(id),
          }).pipe(
            map((data) => ({ data, error: null as ApiError | null })),
            catchError((error: unknown) => of({ data: null, error: toApiError(error) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ data, error }) => {
        this.evaluations.set(data?.evaluations.results ?? []);
        this.verdicts.set(data?.verdicts.results ?? []);
        this.loadError.set(error);
        this.viewState.set(error ? 'error' : 'ready');
      });
  }

  protected reload(): void {
    this.retry$.next();
  }

  protected chooseDecision(decision: VerdictDecision): void {
    this.decision.set(decision);
    this.touched();
  }

  protected editJustification(value: string): void {
    this.justification.set(value);
    this.touched();
  }

  protected editObservations(value: string): void {
    this.observations.set(value);
    this.touched();
  }

  /** Un cambio de contenido es otra intención: la clave de idempotencia ya no sirve. */
  private touched(): void {
    this.idempotencyKey = null;
    this.submitError.set('');
  }

  protected submit(): void {
    if (this.busy()) {
      return;
    }
    this.attempted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      return;
    }
    this.confirmOpen.set(true);
  }

  protected send(): void {
    this.confirmOpen.set(false);
    const decision = this.decision();
    const etag = this.etag();
    if (decision === null || this.busy()) {
      return;
    }
    if (etag === null) {
      this.submitError.set('No se pudo identificar la versión del manuscrito; recargue e intente de nuevo.');
      this.stale.emit();
      return;
    }
    const request: VerdictRequest = {
      decision,
      justification: this.needsJustification() ? this.justification().trim() || null : null,
      observations:
        decision === 'REQUIRES_CORRECTIONS' ? this.observations().trim() || null : null,
    };
    this.idempotencyKey ??= newIdempotencyKey();
    this.busy.set(true);
    this.submitError.set('');
    this.service
      .createVerdict(this.manuscriptId(), request, etag, this.idempotencyKey)
      .subscribe({
        next: (registered) => {
          this.busy.set(false);
          this.idempotencyKey = null;
          this.verdicts.set(registered.result.history);
          this.decision.set(null);
          this.justification.set('');
          this.observations.set('');
          this.attempted.set(false);
          this.registered.emit(registered);
        },
        error: (error: ApiError) => {
          this.busy.set(false);
          this.submitError.set(error.userMessage);
          if (STALE_CODES.includes(error.code)) {
            // Lo que se ve ya no es lo vigente: se relee todo, también el detalle.
            this.idempotencyKey = null;
            this.reload();
            this.stale.emit();
          }
        },
      });
  }
}
