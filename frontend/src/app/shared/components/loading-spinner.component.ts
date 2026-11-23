import { Component, input } from '@angular/core';

/**
 * Indicador de carga con texto accesible para lectores de pantalla
 * (plan §3.10). Respeta `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-loading-spinner',
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.scss',
})
export class LoadingSpinnerComponent {
  /** Texto que se anuncia a los lectores de pantalla. */
  readonly label = input('Cargando…');
}
