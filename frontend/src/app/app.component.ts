import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeService } from './core/theme/theme.service';

/**
 * Componente raíz de la SPA.
 *
 * Solo expone el enrutador; el layout interno (shell, navegación y campana
 * de avisos) se monta en `core/layout` (TSK-14) sobre las rutas de `/app`.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {
  /** Se crea con la raíz para que el tema siga vivo también en las páginas públicas. */
  private readonly theme = inject(ThemeService);
}
