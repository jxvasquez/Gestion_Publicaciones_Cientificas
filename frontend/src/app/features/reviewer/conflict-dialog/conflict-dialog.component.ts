import {
  Component,
  ElementRef,
  booleanAttribute,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../../../core/models/api-error.model';
import {
  CONFLICT_REASON_MAX_LENGTH,
  EvaluationSnapshot,
} from '../../../core/models/reviewer.model';
import { ReviewerService } from '../../../core/services/reviewer.service';

let nextId = 0;

/**
 * Declaración de conflicto de interés (plan sección 3.5, HU-16).
 *
 * * Explica las consecuencias antes de actuar: la evaluación queda
 *   bloqueada (no podrá guardar ni enviar), el Editor es avisado y decide, y
 *   la declaración no se puede deshacer. El motivo es opcional y solo lo
 *   conserva la auditoría.
 * * **Solo da el conflicto por declarado cuando el servidor lo confirma.**
 *   Ante un error (red, `409`, `503`) el diálogo sigue abierto, muestra el
 *   motivo del fallo y conserva el texto escrito.
 * * Emite `declared` con la evaluación ya bloqueada y su `ETag`; quien lo
 *   aloja cierra el diálogo (`open`) y actualiza su estado.
 * * Nunca toca datos de los autores: el conflicto se declara sin
 *   identificarlos.
 */
@Component({
  selector: 'app-conflict-dialog',
  imports: [FormsModule],
  templateUrl: './conflict-dialog.component.html',
  styleUrl: './conflict-dialog.component.scss',
})
export class ConflictDialogComponent {
  private readonly service = inject(ReviewerService);

  /** Asignación sobre la que se declara el conflicto. */
  readonly assignmentId = input.required<string>();

  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** La evaluación tiene cambios sin guardar: se avisa de que se perderán. */
  readonly unsavedChanges = input(false, { transform: booleanAttribute });

  /** El servidor confirmó el conflicto: trae la evaluación ya bloqueada. */
  readonly declared = output<EvaluationSnapshot>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  protected readonly maxLength = CONFLICT_REASON_MAX_LENGTH;
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly titleId = `conflict-dialog-title-${nextId}`;
  protected readonly descriptionId = `conflict-dialog-description-${nextId}`;
  protected readonly reasonId = `conflict-dialog-reason-${nextId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          // Cada apertura empieza limpia.
          this.reason.set('');
          this.error.set('');
          this.busy.set(false);
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
    this.busy.set(true);
    this.error.set('');
    this.service.declareConflict(this.assignmentId(), this.reason().trim() || null).subscribe({
      next: (snapshot) => {
        this.busy.set(false);
        this.declared.emit(snapshot);
      },
      error: (error: ApiError) => {
        this.busy.set(false);
        // El mensaje del servidor distingue «ya declarado» de «asignación cerrada».
        this.error.set(error.status === 409 ? error.message : error.userMessage);
      },
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
