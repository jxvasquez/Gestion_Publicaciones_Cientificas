import {
  Component,
  ElementRef,
  booleanAttribute,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { AcademicArea, RosterChanges, RosterReviewer } from '../../../core/models/area.model';

let nextId = 0;

/**
 * Edición de un revisor del padrón (spec 004, FR-009): casillas con las carreras
 * activas, disponibilidad y foco gestionado en un diálogo nativo.
 *
 * Es presentacional: emite `saved` con los cambios y quien lo usa hace la llamada,
 * indicando `busy` y mostrando `error`. Cambiar carreras o disponibilidad no altera
 * las asignaciones vigentes.
 */
@Component({
  selector: 'app-reviewer-edit-dialog',
  templateUrl: './reviewer-edit-dialog.component.html',
  styleUrl: './reviewer-edit-dialog.component.scss',
})
export class ReviewerEditDialogComponent {
  readonly open = input(false, { transform: booleanAttribute });
  readonly reviewer = input<RosterReviewer | null>(null);
  /** Carreras activas que se pueden elegir. */
  readonly areas = input<readonly AcademicArea[]>([]);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly error = input('');

  readonly saved = output<RosterChanges>();
  readonly cancelled = output<void>();

  protected readonly selected = signal<string[]>([]);
  protected readonly available = signal(true);

  protected readonly titleId = `reviewer-edit-title-${nextId}`;
  protected readonly availableId = `reviewer-edit-available-${nextId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          const current = this.reviewer();
          this.selected.set(current?.areas.map((area) => area.code) ?? []);
          this.available.set(current?.is_available ?? true);
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  /** Las carreras elegibles: las activas más las que el revisor ya tiene (se conservan). */
  protected options(): AcademicArea[] {
    const owned = this.reviewer()?.areas ?? [];
    const extra = owned.filter((area) => !this.areas().some((a) => a.code === area.code));
    return [...this.areas(), ...extra];
  }

  protected toggle(code: string, checked: boolean): void {
    this.selected.update((current) =>
      checked ? [...current.filter((c) => c !== code), code] : current.filter((c) => c !== code),
    );
  }

  protected save(): void {
    if (this.busy()) {
      return;
    }
    this.saved.emit({ areas: this.selected(), is_available: this.available() });
  }

  protected dismiss(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }

  protected onCancelRequested(event: Event): void {
    // Esc: el contenedor decide cuándo cerrar (a través de `open`).
    event.preventDefault();
    this.dismiss();
  }
}
