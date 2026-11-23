import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

import { Assignment, EligibleReviewer, isOpenAssignment } from '../../../core/models/editor.model';

/** Días calendario que tiene el Revisor para evaluar (RN-05). */
export const REVIEW_DEADLINE_DAYS = 20;

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

let nextId = 0;

/**
 * Confirmación de la asignación de un Revisor (plan sección 3.5, HU-11).
 *
 * * Explica que cada manuscrito tiene **un solo Revisor** y que el plazo
 *   es de 20 días calendario.
 * * El servidor fija la fecha límite al asignar; el navegador no la
 *   calcula. Por eso el diálogo anuncia el plazo y, **una vez asignado**,
 *   muestra la fecha límite exacta que devolvió el servidor
 *   (`assignment`): es la misma que verá el Revisor.
 * * Si ya hay una asignación vigente o vencida sin revocar, lo advierte y
 *   no permite confirmar: primero hay que revocarla. Un `409` del servidor
 *   (por ejemplo, otro Editor asignó antes) llega en `error`.
 * * Es presentacional: emite `confirmed`, `cancelled` o `finished` y
 *   quien lo usa hace la llamada, indicando `busy` y mostrando `error`.
 *
 * Usa el elemento nativo `<dialog>`: el foco queda contenido y Esc cancela.
 */
@Component({
  selector: 'app-assign-reviewer-dialog',
  imports: [DatePipe],
  templateUrl: './assign-reviewer-dialog.component.html',
  styleUrl: './assign-reviewer-dialog.component.scss',
})
export class AssignReviewerDialogComponent {
  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** Revisor elegido. */
  readonly reviewer = input<EligibleReviewer | null>(null);

  /** Código del manuscrito, para el texto. */
  readonly manuscriptCode = input('');

  /** Asignación vigente o vencida que ya existe, si la hay. */
  readonly existing = input<Assignment | null>(null);

  /** La asignación está en curso: se bloquean los controles. */
  readonly busy = input(false, { transform: booleanAttribute });

  /** Mensaje de error del servidor, incluido el `409`. */
  readonly error = input('');

  /** Resultado de la asignación: trae la fecha límite fijada por el servidor. */
  readonly assignment = input<Assignment | null>(null);

  /** Se dispara al confirmar la asignación. */
  readonly confirmed = output<void>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  /** Se dispara al cerrar el resultado de una asignación hecha. */
  readonly finished = output<void>();

  protected readonly days = REVIEW_DEADLINE_DAYS;
  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly titleId = `assign-dialog-title-${nextId}`;
  protected readonly descriptionId = `assign-dialog-description-${nextId++}`;

  protected readonly existingBlocksAssignment = computed(() => {
    const existing = this.existing();
    return existing !== null && isOpenAssignment(existing);
  });

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  protected confirm(): void {
    if (this.busy() || this.existingBlocksAssignment()) {
      return;
    }
    this.confirmed.emit();
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
    if (this.assignment()) {
      this.finished.emit();
    } else {
      this.dismiss();
    }
  }
}
