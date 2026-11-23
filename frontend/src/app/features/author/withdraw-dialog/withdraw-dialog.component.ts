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

import { ManuscriptStatus, requiresWithdrawalReason } from '../../../core/models/manuscript.model';

/** Máximo del motivo que acepta la API. */
export const WITHDRAWAL_REASON_MAX_LENGTH = 2000;

let nextId = 0;

/**
 * Confirmación de la baja lógica (plan sección 3.5, HU-08).
 *
 * * Explica qué hace la baja y, sobre todo, que **no borra nada**:
 *   versiones, evaluaciones, historial y auditoría se conservan.
 * * Pide un motivo, obligatorio cuando el manuscrito está en revisión
 *   o aceptado y opcional en los demás estados (CA-HU-08-02).
 * * Es presentacional: emite `confirmed` con el motivo y quien la usa
 *   hace la llamada, indicando `busy` y mostrando `error`.
 *
 * Usa el elemento nativo `<dialog>`: el foco queda contenido, Esc
 * cancela y el fondo no es interactivo. La acción es destructiva, por
 * eso el botón de confirmar es rojo.
 */
@Component({
  selector: 'app-withdraw-dialog',
  imports: [FormsModule],
  templateUrl: './withdraw-dialog.component.html',
  styleUrl: './withdraw-dialog.component.scss',
})
export class WithdrawDialogComponent {
  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** Estado editorial del manuscrito: decide si el motivo es obligatorio. */
  readonly status = input.required<ManuscriptStatus>();

  /** Código del manuscrito, para el título. */
  readonly manuscriptCode = input('');

  /** La baja está en curso: se bloquean los controles. */
  readonly busy = input(false, { transform: booleanAttribute });

  /** Mensaje de error de la baja, si el servidor la rechazó. */
  readonly error = input('');

  /** Se dispara al confirmar, con el motivo (o `null` si no se escribió). */
  readonly confirmed = output<string | null>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  protected readonly maxLength = WITHDRAWAL_REASON_MAX_LENGTH;
  protected readonly reason = signal('');
  private readonly attempted = signal(false);

  protected readonly reasonRequired = computed(() => requiresWithdrawalReason(this.status()));
  protected readonly reasonMissing = computed(
    () => this.attempted() && this.reasonRequired() && this.reason().trim() === '',
  );

  protected readonly titleId = `withdraw-dialog-title-${nextId}`;
  protected readonly descriptionId = `withdraw-dialog-description-${nextId}`;
  protected readonly reasonId = `withdraw-dialog-reason-${nextId}`;
  protected readonly reasonErrorId = `withdraw-dialog-reason-error-${nextId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          // Cada apertura empieza limpia.
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
    const reason = this.reason().trim();
    if (this.reasonRequired() && reason === '') {
      return;
    }
    this.confirmed.emit(reason === '' ? null : reason);
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
