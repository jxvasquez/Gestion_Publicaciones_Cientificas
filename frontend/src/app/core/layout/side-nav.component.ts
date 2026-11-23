import { Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Role, ROLE_LABELS } from '../models/role.model';

interface NavGroup {
  label: string;
  items: { label: string; path: string }[];
}

/**
 * Navegación lateral con los módulos de todos los roles activos
 * (plan §3.4): nunca exige elegir rol ni muestra apartados de roles
 * inexistentes. En pantallas pequeñas se vuelve horizontal.
 */
@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './side-nav.component.html',
  styleUrl: './side-nav.component.scss',
})
export class SideNavComponent {
  /** Roles activos de la sesión. */
  readonly roles = input<Role[]>([]);

  /** Módulos por rol; solo aparecen los roles activos. */
  protected readonly groups = computed<NavGroup[]>(() => {
    const roles = this.roles();
    const groups: NavGroup[] = [];
    if (roles.includes('AUTHOR')) {
      groups.push({
        label: ROLE_LABELS.AUTHOR,
        items: [{ label: 'Mis manuscritos', path: '/app/author/manuscripts' }],
      });
    }
    if (roles.includes('REVIEWER')) {
      groups.push({
        label: ROLE_LABELS.REVIEWER,
        items: [
          { label: 'Mis asignaciones', path: '/app/reviewer/assignments' },
          { label: 'Historial de evaluaciones', path: '/app/reviewer/history' },
        ],
      });
    }
    if (roles.includes('EDITOR')) {
      groups.push({
        label: ROLE_LABELS.EDITOR,
        items: [
          { label: 'Nuevos envíos', path: '/app/editor/submissions' },
          { label: 'Asignaciones vencidas', path: '/app/editor/assignments/expired' },
          { label: 'Incidentes', path: '/app/editor/incidents' },
        ],
      });
    }
    if (roles.includes('ADMIN')) {
      groups.push({
        label: ROLE_LABELS.ADMIN,
        items: [{ label: 'Auditoría', path: '/app/admin/audit' }],
      });
    }
    return groups;
  });
}
