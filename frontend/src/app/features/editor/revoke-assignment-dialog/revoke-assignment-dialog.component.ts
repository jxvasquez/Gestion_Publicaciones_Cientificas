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
  Assignment,
  REVOCATION_CAUSES,
  RevocationCause,
  isOverdue,
} from '../../../core/models/editor.model';

/** Máximo del motivo que acepta la API. */
export const REVOCATION_REASON_MAX_LENGTH = 2000;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

let nextId = 0;

/** Lo que el diálogo entrega al confirmar: la causa y el motivo escrito. */
export interface RevocationRequest {
  cause: RevocationCause;
  reason: string;
}

/**
 * Confirmación de la revocación de una asignación (plan sección 3.5, HU-11).
 *
 * * Distingue la causa: conflicto de interés, error de asignación, cuenta
 *   inhabilitada o plazo vencido. Con el plazo vigente solo se ofrecen las
 *   tres primeras; «plazo vencido» aparece únicamente cuando la asignación
 *   ya venció (el servidor aplica la misma regla).
 * * El motivo escrito es obligatorio.
 * * Aclara las consecuencias: el manuscrito sigue en revisión pendiente de
 *   un nuevo Revisor y las evaluaciones ya escritas se conservan.
 * * Es presentacional: emite `confirmed` con la causa y el motivo y quien
 *   lo usa hace la llamada, indicando `busy` y mostrando `error`.
 *
 * La acción es destructiva, por eso el botón de confirmar es rojo.
 */
@Component({
  selector: 'app-revoke-assignment-dialog',
  imports: [FormsModule, DatePipe],
  templateUrl: './revoke-assignment-dialog.component.html',
  styleUrl: './revoke-assignment-dialog.component.scss',
})
export class RevokeAssignmentDialogComponent {
  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** Asignación que se revocaría. */
  readonly assignment = input<Assignment | null>(null);

  /** La revocación está en curso: se bloquean los controles. */
  readonly busy = input(false, { transform: booleanAttribute });

  /** Mensaje de error del servidor, si rechazó la revocación. */
  readonly error = input('');

  /** Se dispara al confirmar, con la causa y el motivo. */
  readonly confirmed = output<RevocationRequest>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly maxLength = REVOCATION_REASON_MAX_LENGTH;
  protected readonly cause = signal<RevocationCause | null>(null);
  protected readonly reason = signal('');
  private readonly attempted = signal(false);

  protected readonly overdue = computed(() => {
    const current = this.assignment();
    return current !== null && isOverdue(current);
  });

  /** Con el plazo vigente no se ofrece «plazo vencido». */
  protected readonly causes = computed(() =>
    REVOCATION_CAUSES.filter((option) => option.early || this.overdue()),
  );

  protected readonly causeMissing = computed(() => this.attempted() && this.cause() === null);
  protected readonly reasonMissing = computed(
    () => this.attempted() && this.reason().trim() === '',
  );

  protected readonly titleId = `revoke-dialog-title-${nextId}`;
  protected readonly descriptionId = `revoke-dialog-description-${nextId}`;
  protected readonly reasonId = `revoke-dialog-reason-${nextId}`;
  protected readonly reasonErrorId = `revoke-dialog-reason-error-${nextId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          // Cada apertura empieza limpia; vencida sugiere su causa natural.
          this.cause.set(this.overdue() ? 'OVERDUE' : null);
          this.reason.set('');
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
    const cause = this.cause();
    const reason = this.reason().trim();
    if (cause === null || reason === '') {
      return;
    }
    this.confirmed.emit({ cause, reason });
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
