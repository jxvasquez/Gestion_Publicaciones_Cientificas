import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Role, ROLE_LABELS } from '../models/role.model';
import { NotificationBellComponent } from './notification-bell.component';
import { ThemeToggleComponent } from './theme-toggle.component';

/**
 * Encabezado del área interna: título institucional, roles activos
 * como insignias informativas (nunca un selector o conmutador de
 * rol), campana de avisos, botón de tema, nombre y cierre de sesión.
 */
@Component({
  selector: 'app-header',
  imports: [RouterLink, NotificationBellComponent, ThemeToggleComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  /** Nombre visible de la persona autenticada. */
  readonly userName = input<string | null>(null);

  /** Iniciales para el avatar; `null` muestra el icono genérico de persona. */
  readonly userInitials = input<string | null>(null);

  /** Roles activos, mostrados como insignias informativas. */
  readonly roles = input<Role[]>([]);

  /** Cantidad de avisos propios no leídos. */
  readonly unreadCount = input(0);

  /** Se dispara al pulsar Cerrar sesión (se conecta en TSK-26). */
  readonly logout = output<void>();

  /** Se dispara al activar la campana (se conecta en TSK-26). */
  readonly bellOpened = output<void>();

  protected readonly roleLabels = ROLE_LABELS;
}
