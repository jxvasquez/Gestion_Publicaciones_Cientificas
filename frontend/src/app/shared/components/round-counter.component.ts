import { Component, input } from '@angular/core';

/**
 * Contador de rondas editoriales (HU-22). Muestra la ronda vigente con
 * la misma semántica visual en todos los módulos.
 */
@Component({
  selector: 'app-round-counter',
  templateUrl: './round-counter.component.html',
  styleUrl: './round-counter.component.scss',
})
export class RoundCounterComponent {
  /** Número de ronda vigente del manuscrito (0 es la ronda de envío). */
  readonly round = input.required<number>();
}
