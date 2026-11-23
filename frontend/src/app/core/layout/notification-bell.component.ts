import { Component, computed, input, output } from '@angular/core';

/**
 * Campana de avisos con contador de no leídos (plan §3.5).
 * Botón nativo: navegable por teclado y con etiqueta accesible que
 * refleja el contador sin exponer datos de otros usuarios.
 */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {
  /** Cantidad de avisos propios no leídos. */
  readonly unreadCount = input(0);

  /** Se dispara al activar la campana. */
  readonly opened = output<void>();

  protected readonly ariaLabel = computed(() =>
    this.unreadCount() > 0
      ? `Avisos: ${this.unreadCount()} sin leer`
      : 'Avisos: sin notificaciones sin leer',
  );
}
