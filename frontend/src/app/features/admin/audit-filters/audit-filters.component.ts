import { Component, effect, inject, input, output } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';

import {
  AUDIT_ACTIONS,
  AUDIT_RESULTS,
  AuditFilters,
  AuditResult,
} from '../../../core/models/audit.model';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION = /^[A-Z0-9_]{1,64}$/;

/** Vacío o un UUID: el backend rechaza (`400`) cualquier otro valor. */
function optionalUuid(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return !value || UUID.test(value) ? null : { uuid: true };
}

function optionalAction(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  return !value || ACTION.test(value) ? null : { action: true };
}

/**
 * Filtros combinados de la auditoría (HU-17): fecha, actor, acción,
 * manuscrito y resultado.
 *
 * Es presentacional: recibe los filtros vigentes (los de la URL) y emite
 * los nuevos al enviar; quien lo contiene los lleva a la URL y consulta.
 * Un campo vacío no es un filtro, y solo se envía lo que el backend acepta:
 * «Desde» no puede ser posterior a «Hasta», y actor y manuscrito son ids.
 */
@Component({
  selector: 'app-audit-filters',
  imports: [ReactiveFormsModule],
  templateUrl: './audit-filters.component.html',
  styleUrl: './audit-filters.component.scss',
})
export class AuditFiltersComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  /** Filtros vigentes (los de la URL); el formulario los refleja. */
  readonly filters = input<AuditFilters>({});

  /** Filtros nuevos al enviar (sin campos vacíos). */
  readonly searched = output<AuditFilters>();

  /** Se quitaron todos los filtros. */
  readonly cleared = output<void>();

  protected readonly actions = AUDIT_ACTIONS;
  protected readonly results = AUDIT_RESULTS;

  protected readonly form = this.formBuilder.group(
    {
      date_from: [''],
      date_to: [''],
      action: ['', optionalAction],
      result: [''],
      actor: ['', optionalUuid],
      manuscript: ['', optionalUuid],
    },
    {
      validators: (group) => {
        const from = group.get('date_from')?.value as string;
        const to = group.get('date_to')?.value as string;
        return from && to && from > to ? { dateRange: true } : null;
      },
    },
  );

  constructor() {
    effect(() => {
      const filters = this.filters();
      this.form.reset(
        {
          date_from: filters.date_from ?? '',
          date_to: filters.date_to ?? '',
          action: filters.action ?? '',
          result: filters.result ?? '',
          actor: filters.actor ?? '',
          manuscript: filters.manuscript ?? '',
        },
        { emitEvent: false },
      );
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const filters: AuditFilters = {};
    if (value.date_from) {
      filters.date_from = value.date_from;
    }
    if (value.date_to) {
      filters.date_to = value.date_to;
    }
    const action = value.action.trim();
    if (action) {
      filters.action = action;
    }
    if (value.result) {
      filters.result = value.result as AuditResult;
    }
    for (const key of ['actor', 'manuscript'] as const) {
      const id = value[key].trim();
      if (id) {
        filters[key] = id.toLowerCase();
      }
    }
    this.searched.emit(filters);
  }

  protected clear(): void {
    this.cleared.emit();
  }
}
