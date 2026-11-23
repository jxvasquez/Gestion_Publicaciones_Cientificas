import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Notice, internalLink } from '../../../core/models/notification.model';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Un aviso del panel (HU-18). Presentacional: muestra solo el contenido
 * sanitizado que envía el backend y avisa cuando el usuario lo abre o lo
 * marca como leído; quien lo usa hace la llamada.
 *
 * El enlace del aviso solo se activa si es una ruta interna de la SPA. Los
 * no leídos se distinguen por texto («Nuevo») y no solo por color.
 */
@Component({
  selector: 'app-notification-item',
  imports: [DatePipe, RouterLink],
  templateUrl: './notification-item.component.html',
  styleUrl: './notification-item.component.scss',
})
export class NotificationItemComponent {
  /** Aviso que se muestra. */
  readonly notice = input.required<Notice>();

  /** Marcar como leído está en curso. */
  readonly busy = input(false);

  /** El usuario abrió el enlace del aviso. */
  readonly opened = output<Notice>();

  /** El usuario pidió marcarlo como leído. */
  readonly markRead = output<Notice>();

  protected readonly offset = INSTITUTIONAL_OFFSET;

  protected readonly link = computed(() => internalLink(this.notice().payload.link));

  protected readonly hasDetails = computed(() => {
    const payload = this.notice().payload;
    return Boolean(payload.manuscript_code || payload.action || payload.due_at);
  });
}
