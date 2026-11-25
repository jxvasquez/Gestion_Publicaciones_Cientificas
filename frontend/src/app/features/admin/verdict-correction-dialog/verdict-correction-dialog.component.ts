import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AuditVerdict,
  CORRECTION_REASON_MAX_LENGTH,
  CorrectionDecision,
  CORRECTION_REASON_MIN_LENGTH,
  DECISION_LABELS,
} from '../../../core/models/audit.model';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

let nextId = 0;

/** Decisiones que el Administrador puede registrar al corregir. */
export const CORRECTION_DECISIONS: readonly { value: CorrectionDecision; label: string }[] = [
  { value: 'ACCEPTED', label: 'Aceptado' },
  { value: 'REJECTED', label: 'Rechazado' },
  { value: 'CHANGES_REQUESTED', label: 'Cambios solicitados' },
];

/** Lo que el diálogo entrega al confirmar: la nueva decisión, el motivo y, si aplica, las observaciones. */
export interface CorrectionChoice {
  decision: CorrectionDecision;
  reason: string;
  observations?: string;
}

/** Con «Cambios solicitados» las observaciones para el Autor son obligatorias. */
export function observationsError(decision: CorrectionDecision | null, text: string): string | null {
  return decision === 'CHANGES_REQUESTED' && text.trim() === ''
    ? 'Indique las observaciones para el Autor.'
    : null;
}

/** Error del motivo según las reglas del servidor (10 a 1000 caracteres, sin espacios sobrantes). */
export function correctionReasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) {
    return 'Indique el motivo de la corrección.';
  }
  if (length < CORRECTION_REASON_MIN_LENGTH) {
    return `El motivo debe tener al menos ${CORRECTION_REASON_MIN_LENGTH} caracteres.`;
  }
  if (length > CORRECTION_REASON_MAX_LENGTH) {
    return `El motivo no puede superar ${CORRECTION_REASON_MAX_LENGTH} caracteres.`;
  }
  return null;
}

/**
 * Corrección administrativa de un veredicto (CA-HU-13-12, spec 004 R-14).
 *
 * * El Administrador registra la nueva decisión y un motivo obligatorio de 10 a
 *   1000 caracteres; con «Cambios solicitados» también las observaciones.
 * * Aclara el efecto: la decisión anterior se conserva intacta y la nueva la
 *   sustituye como la vigente.
 * * Muestra solo lo mínimo del veredicto (código, decisión y fecha).
 * * Es presentacional: emite `confirmed` con la elección y quien lo usa hace la
 *   llamada, indicando `busy` y mostrando `error`.
 */
@Component({
  selector: 'app-verdict-correction-dialog',
  imports: [FormsModule, DatePipe],
  templateUrl: './verdict-correction-dialog.component.html',
  styleUrl: './verdict-correction-dialog.component.scss',
})
export class VerdictCorrectionDialogComponent {
  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** Veredicto sobre el que se habilita la corrección. */
  readonly verdict = input<AuditVerdict | null>(null);

  /** La habilitación está en curso: se bloquean los controles. */
  readonly busy = input(false, { transform: booleanAttribute });

  /** Mensaje de error del servidor, si rechazó la habilitación. */
  readonly error = input('');

  /** Se dispara al confirmar, con los textos ya sin espacios sobrantes. */
  readonly confirmed = output<CorrectionChoice>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly min = CORRECTION_REASON_MIN_LENGTH;
  protected readonly max = CORRECTION_REASON_MAX_LENGTH;
  protected readonly decisions = CORRECTION_DECISIONS;
  protected readonly decision = signal<CorrectionDecision | null>(null);
  protected readonly observations = signal('');
  protected readonly reason = signal('');
  private readonly attempted = signal(false);

  protected readonly decisionLabel = computed(() => {
    const decision = this.verdict()?.decision ?? '';
    return DECISION_LABELS[decision] ?? decision;
  });

  protected readonly reasonError = computed(() =>
    this.attempted() ? correctionReasonError(this.reason()) : null,
  );

  protected readonly decisionError = computed(() =>
    this.attempted() && this.decision() === null ? 'Seleccione la nueva decisión.' : null,
  );

  protected readonly observationsError = computed(() =>
    this.attempted() ? observationsError(this.decision(), this.observations()) : null,
  );

  protected readonly observationsId = `correction-dialog-observations-${nextId}`;
  protected readonly titleId = `correction-dialog-title-${nextId}`;
  protected readonly descriptionId = `correction-dialog-description-${nextId}`;
  protected readonly reasonId = `correction-dialog-reason-${nextId}`;
  protected readonly reasonErrorId = `correction-dialog-reason-error-${nextId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          // Cada apertura empieza limpia.
          this.reason.set('');
          this.decision.set(null);
          this.observations.set('');
          this.attempted.set(false);
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  protected confirm(): void {
    if (this.busy()) {
      return;
    }
    this.attempted.set(true);
    const decision = this.decision();
    if (
      decision === null ||
      correctionReasonError(this.reason()) !== null ||
      observationsError(decision, this.observations()) !== null
    ) {
      return;
    }
    const observations = this.observations().trim();
    this.confirmed.emit({
      decision,
      reason: this.reason().trim(),
      ...(decision === 'CHANGES_REQUESTED' && observations ? { observations } : {}),
    });
  }

  protected dismiss(): void {
    if (this.busy()) {
      return;
    }
    this.cancelled.emit();
  }

  protected onCancelRequested(event: Event): void {
    // Esc: el contenedor decide cuándo cerrar (a través de `open`).
    event.preventDefault();
    this.dismiss();
  }
}
