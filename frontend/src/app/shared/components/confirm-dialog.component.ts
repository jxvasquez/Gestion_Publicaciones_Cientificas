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

let nextDialogId = 0;

/**
 * Diálogo de confirmación reutilizable para acciones críticas,
 * incluidas las destructivas (baja lógica, revocación).
 *
 * Usa el elemento nativo `<dialog>`: el foco queda contenido, la tecla
 * Esc dispara `cancelled` y el fondo no es interactivo.
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  /** Título del diálogo. */
  readonly title = input('Confirmar acción');

  /** Mensaje que describe la consecuencia de confirmar. */
  readonly message = input.required<string>();

  /** Etiqueta del botón de confirmación. */
  readonly confirmLabel = input('Confirmar');

  /** Etiqueta del botón de cancelación. */
  readonly cancelLabel = input('Cancelar');

  /** Marca la acción como destructiva (botón rojo). */
  readonly destructive = input(false, { transform: booleanAttribute });

  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** Se dispara al confirmar la acción. */
  readonly confirmed = output<void>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  protected readonly titleId = `confirm-dialog-title-${nextDialogId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly confirmClass = computed(() =>
    this.destructive() ? 'btn btn--danger' : 'btn btn--primary',
  );

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
    this.dialogRef().nativeElement.close();
    this.confirmed.emit();
  }

  protected dismiss(): void {
    this.dialogRef().nativeElement.close();
    this.cancelled.emit();
  }

  protected onCancelRequested(event: Event): void {
    // Esc: evita el cierre automático para emitir el evento de cancelación.
    event.preventDefault();
    this.cancelled.emit();
    this.dialogRef().nativeElement.close();
  }
}
