import {
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../../../core/models/api-error.model';
import {
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_REPORT_TYPES,
  IncidentReceipt,
  IncidentReportType,
} from '../../../core/models/reviewer.model';
import { ReviewerService } from '../../../core/services/reviewer.service';

let nextId = 0;

/**
 * Reporte confidencial de una posible fuga de identidad (plan sección 3.5, HU-16).
 *
 * * Es un canal **confidencial**: solo el Administrador lo lee. El Autor no se
 *   entera de que existe y nada del Revisor llega a él; el diálogo lo dice
 *   expresamente. Reportar no modifica la evaluación, el PDF ni el estado
 *   del manuscrito.
 * * Pide el tipo y una descripción obligatoria.
 * * **Solo da el reporte por enviado cuando el servidor lo confirma** (`201`).
 *   Ante un error de red, un `409` (ya hay un reporte abierto) o un `503`
 *   el diálogo sigue abierto, muestra que el reporte NO se envió y conserva
 *   el texto para reintentarlo.
 * * Emite `reported` con el acuse; quien lo aloja cierra el diálogo (`open`)
 *   y avisa al Revisor.
 */
@Component({
  selector: 'app-identity-leak-dialog',
  imports: [FormsModule],
  templateUrl: './identity-leak-dialog.component.html',
  styleUrl: './identity-leak-dialog.component.scss',
})
export class IdentityLeakDialogComponent {
  private readonly service = inject(ReviewerService);

  /** Asignación sobre la que se reporta. */
  readonly assignmentId = input.required<string>();

  /** Abre o cierra el diálogo. */
  readonly open = input(false, { transform: booleanAttribute });

  /** El servidor registró el reporte: trae solo el acuse. */
  readonly reported = output<IncidentReceipt>();

  /** Se dispara al cancelar, incluido el cierre con Esc. */
  readonly cancelled = output<void>();

  protected readonly types = INCIDENT_REPORT_TYPES;
  protected readonly maxLength = INCIDENT_DESCRIPTION_MAX_LENGTH;
  protected readonly type = signal<IncidentReportType>('IDENTITY_LEAK');
  protected readonly description = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly attempted = signal(false);

  protected readonly descriptionMissing = computed(
    () => this.attempted() && this.description().trim() === '',
  );

  protected readonly titleId = `leak-dialog-title-${nextId}`;
  protected readonly descriptionId = `leak-dialog-description-${nextId}`;
  protected readonly descriptionFieldId = `leak-dialog-text-${nextId}`;
  protected readonly descriptionErrorId = `leak-dialog-text-error-${nextId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          // Cada apertura empieza limpia.
          this.type.set('IDENTITY_LEAK');
          this.description.set('');
          this.error.set('');
          this.attempted.set(false);
          this.busy.set(false);
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  protected confirm(): void {
    if (this.busy()) {
      return;
    }
    this.attempted.set(true);
    const description = this.description().trim();
    if (description === '') {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.service.reportIdentityLeak(this.assignmentId(), this.type(), description).subscribe({
      next: (receipt) => {
        this.busy.set(false);
        this.reported.emit(receipt);
      },
      error: (error: ApiError) => {
        this.busy.set(false);
        const reason = error.status === 409 ? error.message : error.userMessage;
        this.error.set(`El reporte NO se envió. ${reason}`);
      },
    });
  }

  protected dismiss(): void {
    if (this.busy()) {
      return;
    }
    this.cancelled.emit();
  }

  protected onCancelRequested(event: Event): void {
    // Esc: el contenedor decide cuándo cerrar (a través de `open`).
    event.preventDefault();
    this.dismiss();
  }
}
