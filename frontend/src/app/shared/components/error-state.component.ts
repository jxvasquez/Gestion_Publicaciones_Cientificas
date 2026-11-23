import { Component, input, output } from '@angular/core';

/**
 * Estado de error con reintento (plan §3.10). Se anuncia como `alert`
 * y nunca revela si un recurso ajeno existe: el mensaje llega ya
 * normalizado desde el backend.
 */
@Component({
  selector: 'app-error-state',
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.scss',
})
export class ErrorStateComponent {
  /** Mensaje de error accionable, sin detalles internos. */
  readonly message = input.required<string>();

  /** Etiqueta del botón de reintento; si es nula no se muestra botón. */
  readonly retryLabel = input<string | null>('Reintentar');

  /** Se dispara al pulsar el botón de reintento. */
  readonly retry = output<void>();
}
