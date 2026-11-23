import { Component, input, output } from '@angular/core';

/**
 * Estado vacío con mensaje y acción sugerida (plan §3.10).
 * Se anuncia como `status` para lectores de pantalla.
 */
@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  /** Mensaje descriptivo del estado vacío. */
  readonly message = input.required<string>();

  /** Etiqueta de la acción sugerida; si es nula no se muestra botón. */
  readonly actionLabel = input<string | null>(null);

  /** Se dispara al pulsar la acción sugerida. */
  readonly action = output<void>();
}
