import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { ApiFeedbackStore } from '../http/api-feedback.store';
import { NotificationService } from '../services/notification.service';
import { HeaderComponent } from './header.component';
import { SideNavComponent } from './side-nav.component';

/**
 * Layout interno del área autenticada (plan §3.5): encabezado,
 * navegación por roles, campana de avisos y contenido enrutado.
 *
 * TSK-26: se conecta al `AuthStore` (nombre, roles activos) y al
 * `AuthService` (cierre de sesión) y renderiza los mensajes
 * accionables de la API publicados por el interceptor de errores
 * (`ApiFeedbackStore`). El contador de la campana sale de
 * `NotificationService` (TSK-83): se lee al entrar al área y se ajusta al
 * marcar avisos como leídos.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, HeaderComponent, SideNavComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly feedback = inject(ApiFeedbackStore);

  /** Avisos propios sin leer. */
  protected readonly unreadCount = this.notifications.unreadCount;

  constructor() {
    this.notifications.refresh();
  }

  /** Nombre visible de la persona autenticada (null si anónima). */
  protected readonly userName = computed(() => this.store.user()?.full_name ?? null);

  /** Roles activos: alimentan insignias y módulos de navegación. */
  protected readonly roles = computed(() => this.store.roles());

  /** Cierre de sesión: revoca el refresh y vuelve al login. */
  protected logout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }

  /** La campana lleva a los avisos propios (TSK-83). */
  protected openNotifications(): void {
    void this.router.navigate(['/app/notifications']);
  }
}
