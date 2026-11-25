import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../../../core/models/api-error.model';
import { AdminArea } from '../../../core/models/area.model';
import { AdminService } from '../../../core/services/admin.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';

/** Qué carrera se activa o desactiva, a la espera de la confirmación. */
interface PendingToggle {
  area: AdminArea;
  activate: boolean;
}

/**
 * Catálogo de carreras del Administrador (spec 004, FR-007 y FR-009): listado con los
 * conteos de uso, alta, cambio de nombre en línea y activación o desactivación con
 * confirmación. Desactivar una carrera no altera asignaciones ni historial: solo deja
 * de ofrecerse.
 */
@Component({
  selector: 'app-area-catalog',
  imports: [
    FormsModule,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './area-catalog.component.html',
  styleUrl: './area-catalog.component.scss',
})
export class AreaCatalogComponent {
  private readonly service = inject(AdminService);

  protected readonly areas = signal<AdminArea[]>([]);
  protected readonly viewState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly error = signal<ApiError | null>(null);
  protected readonly actionError = signal('');
  protected readonly notice = signal('');

  protected readonly newName = signal('');
  protected readonly creating = signal(false);

  /** Código de la carrera cuyo nombre se edita en línea. */
  protected readonly editing = signal<string | null>(null);
  protected readonly draftName = signal('');
  protected readonly pending = signal<PendingToggle | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.viewState.set('loading');
    this.service.listAreas().subscribe({
      next: (areas) => {
        this.areas.set(areas);
        this.viewState.set('ready');
      },
      error: (error: ApiError) => {
        this.error.set(error);
        this.viewState.set('error');
      },
    });
  }

  protected create(): void {
    const name = this.newName().trim();
    if (this.creating()) {
      return;
    }
    if (name === '') {
      this.actionError.set('Indique el nombre de la carrera.');
      return;
    }
    this.creating.set(true);
    this.actionError.set('');
    this.service.createArea(name).subscribe({
      next: (area) => {
        this.creating.set(false);
        this.newName.set('');
        this.notice.set(`Carrera «${area.name}» creada.`);
        this.areas.update((rows) =>
          [...rows, area].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
      },
      error: (error: ApiError) => {
        this.creating.set(false);
        this.actionError.set(error.userMessage);
      },
    });
  }

  protected startEdit(area: AdminArea): void {
    this.notice.set('');
    this.actionError.set('');
    this.editing.set(area.code);
    this.draftName.set(area.name);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected saveName(area: AdminArea): void {
    const name = this.draftName().trim();
    if (name === area.name) {
      this.editing.set(null);
      return;
    }
    this.service.updateArea(area.code, { name }).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.editing.set(null);
        this.notice.set(`Carrera renombrada a «${updated.name}».`);
      },
      error: (error: ApiError) => this.actionError.set(error.userMessage),
    });
  }

  protected askToggle(area: AdminArea): void {
    this.notice.set('');
    this.actionError.set('');
    this.pending.set({ area, activate: !area.is_active });
  }

  protected confirmMessage(): string {
    const pending = this.pending();
    if (pending === null) {
      return '';
    }
    return pending.activate
      ? `«${pending.area.name}» volverá a ofrecerse a los Autores y en los filtros.`
      : `«${pending.area.name}» dejará de ofrecerse. Sus manuscritos, revisores e historial se conservan y los manuscritos en curso siguen asignándose por ella.`;
  }

  protected confirmToggle(): void {
    const pending = this.pending();
    this.pending.set(null);
    if (pending === null) {
      return;
    }
    this.service.updateArea(pending.area.code, { is_active: pending.activate }).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.notice.set(`Carrera «${updated.name}» ${updated.is_active ? 'activada' : 'desactivada'}.`);
      },
      error: (error: ApiError) => this.actionError.set(error.userMessage),
    });
  }

  private replace(updated: AdminArea): void {
    this.areas.update((rows) => rows.map((row) => (row.code === updated.code ? updated : row)));
  }
}
