import { Component, inject } from '@angular/core';

import { ThemeService } from '../theme/theme.service';

/**
 * Botón de tema de la cabecera (spec 005, FR-007). Es un conmutador: su nombre
 * accesible no cambia y `aria-pressed` dice si el tema oscuro está activo. El icono es
 * decorativo y muestra el tema al que se pasa.
 */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  protected readonly themes = inject(ThemeService);
}
