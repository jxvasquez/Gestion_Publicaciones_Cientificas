import { areaNames } from '../../../core/models/area.model';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { newIdempotencyKey } from '../../../core/http/idempotency-key';
import { ApiError } from '../../../core/models/api-error.model';
import {
  DraftFileSummary,
  Manuscript,
  SubmissionResult,
  isEditable,
  nextAction,
} from '../../../core/models/manuscript.model';
import { ManuscriptService } from '../../../core/services/manuscript.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { RoundCounterComponent } from '../../../shared/components/round-counter.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { EditorialProgressComponent } from '../editorial-progress/editorial-progress.component';
import { PdfUploaderComponent } from '../pdf-uploader/pdf-uploader.component';
import { SUBMISSION_FIELD_LABELS, submissionErrorMessage } from '../submission-messages';
import { WithdrawDialogComponent } from '../withdraw-dialog/withdraw-dialog.component';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Detalle de un manuscrito propio (plan sección 3.5, HU-06/HU-22).
 *
 * * Metadatos, autores, estado, versión, ronda y la **siguiente acción**.
 * * Progreso del ciclo editorial por etapas, sin datos de los revisores.
 * * Observaciones y veredicto cuando existen: la vista solo lee
 *   `comments_for_author`, `decision` y `observations`
 *   (`AuthorEvaluationFeedbackSerializer`). Nunca muestra la identidad
 *   del Revisor, comentarios confidenciales ni puntuaciones, aunque
 *   la respuesta los trajera por error.
 * * La acción de editar solo aparece en `DRAFT` o `CHANGES_REQUESTED`
 *   y si el manuscrito no está dado de baja.
 * * Un manuscrito dado de baja se muestra archivado y en solo lectura.
 *
 * El PDF de borrador se adjunta con el cargador (TSK-42); el envío formal
 * pide confirmación y entrega un comprobante con el código de seguimiento;
 * en correcciones el mismo cargador envía la nueva versión; la baja lógica
 * tiene su propio diálogo (TSK-43).
 */
@Component({
  selector: 'app-manuscript-detail',
  imports: [
    DatePipe,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    StatusBadgeComponent,
    RoundCounterComponent,
    EditorialProgressComponent,
    FileSizePipe,
    PdfUploaderComponent,
    WithdrawDialogComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './manuscript-detail.component.html',
  styleUrl: './manuscript-detail.component.scss',
})
export class ManuscriptDetailComponent {
  protected readonly areaNames = areaNames;
  private readonly service = inject(ManuscriptService);
  private readonly route = inject(ActivatedRoute);

  protected readonly offset = INSTITUTIONAL_OFFSET;
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly manuscript = signal<Manuscript | null>(null);

  protected readonly withdrawOpen = signal(false);
  protected readonly withdrawing = signal(false);
  protected readonly withdrawError = signal('');
  protected readonly notice = signal('');

  protected readonly submitOpen = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal('');
  /** Comprobante del último envío o nueva versión (código, versión, ronda, fecha y sello). */
  protected readonly confirmation = signal<{ title: string; result: SubmissionResult } | null>(
    null,
  );

  /** Clave de idempotencia del envío en curso: se reutiliza si hay que reintentarlo. */
  private submitKey: string | null = null;

  protected readonly editable = computed(() => {
    const manuscript = this.manuscript();
    return manuscript !== null && isEditable(manuscript);
  });

  /**
   * El PDF de borrador solo se adjunta o reemplaza mientras el manuscrito
   * es un borrador activo; en correcciones la carga es la de una nueva
   * versión.
   */
  protected readonly canUpload = computed(() => {
    const manuscript = this.manuscript();
    return manuscript !== null && manuscript.is_active && manuscript.status === 'DRAFT';
  });

  /** En correcciones la carga del PDF corregido es una nueva versión. */
  protected readonly canSendVersion = computed(() => {
    const manuscript = this.manuscript();
    return (
      manuscript !== null && manuscript.is_active && manuscript.status === 'CHANGES_REQUESTED'
    );
  });

  /** Lo que aún falta para poder enviar el borrador (CA-HU-04-02). */
  protected readonly missingForSubmit = computed(() => {
    const manuscript = this.manuscript();
    if (manuscript === null) {
      return [];
    }
    const missing = (['title', 'abstract', 'keywords', 'language'] as const)
      .filter((field) => {
        const value = manuscript[field];
        return Array.isArray(value) ? value.length === 0 : value.trim() === '';
      })
      .map((field) => SUBMISSION_FIELD_LABELS[field]);
    if (manuscript.areas.length === 0) {
      missing.push('Carreras o áreas');
    }
    if (manuscript.draft_file === null) {
      missing.push(SUBMISSION_FIELD_LABELS['draft_file']);
    }
    return missing;
  });

  protected readonly submitMessage = computed(() => {
    const draft = this.manuscript()?.draft_file;
    return `Se creará la versión v1 con ${draft ? `el PDF «${draft.filename}»` : 'el PDF adjunto'} y los metadatos actuales. Una vez enviado no podrá editarlos hasta que se soliciten cambios.`;
  });

  protected readonly action = computed(() => {
    const manuscript = this.manuscript();
    return manuscript ? nextAction(manuscript) : { short: '', detail: '' };
  });

  constructor() {
    this.load();
  }

  protected openWithdraw(): void {
    this.withdrawError.set('');
    this.notice.set('');
    this.withdrawOpen.set(true);
  }

  protected cancelWithdraw(): void {
    this.withdrawOpen.set(false);
    this.withdrawError.set('');
  }

  /** Baja lógica: el servidor marca el manuscrito y conserva todo su historial. */
  protected confirmWithdraw(reason: string | null): void {
    if (this.withdrawing()) {
      return;
    }
    this.withdrawing.set(true);
    this.withdrawError.set('');
    this.service.withdraw(this.id, reason).subscribe({
      next: ({ manuscript }) => {
        this.manuscript.set(manuscript);
        this.withdrawing.set(false);
        this.withdrawOpen.set(false);
        this.notice.set(
          'El manuscrito fue dado de baja. Su historial, sus versiones y su auditoría se conservan, y puede consultarlo en la vista de archivados.',
        );
      },
      error: (error: ApiError) => {
        this.withdrawing.set(false);
        if (error.status === 409) {
          // Ya estaba dado de baja o su estado cambió: se muestra el estado real.
          this.withdrawOpen.set(false);
          this.load();
          return;
        }
        this.withdrawError.set(withdrawalMessage(error));
      },
    });
  }

  protected openSubmit(): void {
    if (this.missingForSubmit().length > 0 || this.submitting()) {
      return;
    }
    this.submitError.set('');
    this.notice.set('');
    this.confirmation.set(null);
    this.submitOpen.set(true);
  }

  protected cancelSubmit(): void {
    this.submitOpen.set(false);
  }

  /**
   * Envío formal: crea la versión v1 y la ronda 0. La clave de
   * idempotencia se conserva entre reintentos de esta misma intención, de
   * modo que un corte de red no duplica el envío.
   */
  protected confirmSubmit(): void {
    this.submitOpen.set(false);
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set('');
    this.submitKey ??= newIdempotencyKey();

    this.service.submit(this.id, this.submitKey).subscribe({
      next: (result) => {
        this.submitKey = null;
        this.submitting.set(false);
        this.confirmation.set({ title: 'Manuscrito enviado', result });
        this.refresh();
      },
      error: (error: ApiError) => {
        this.submitting.set(false);
        if (error.status === 409) {
          this.submitKey = null;
          this.onStateConflict();
          return;
        }
        if (error.status === 400) {
          // Faltan datos: al corregirlos es una intención nueva.
          this.submitKey = null;
        }
        this.submitError.set(submissionErrorMessage(error));
      },
    });
  }

  /** El servidor registró la nueva versión: se muestra el comprobante y el estado vigente. */
  protected onVersionSubmitted(result: SubmissionResult): void {
    this.notice.set('');
    this.confirmation.set({ title: 'Nueva versión enviada', result });
    this.refresh();
  }

  /** El estado cambió mientras se trabajaba (otra pestaña, otro actor): se actualiza. */
  protected onStateConflict(): void {
    this.confirmation.set(null);
    this.notice.set('El estado del manuscrito cambió; se actualizó la información.');
    this.refresh();
  }

  /** El servidor ya guardó el PDF: se refleja sin recargar el manuscrito. */
  protected onDraftUploaded(draft: DraftFileSummary): void {
    this.manuscript.update((manuscript) =>
      manuscript ? { ...manuscript, draft_file: draft } : manuscript,
    );
  }

  /** Recarga el manuscrito sin parpadeo; si falla, pasa a la carga con error visible. */
  private refresh(): void {
    this.service.get(this.id).subscribe({
      next: ({ manuscript }) => this.manuscript.set(manuscript),
      error: () => this.load(),
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get(this.id).subscribe({
      next: ({ manuscript }) => {
        this.manuscript.set(manuscript);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }
}

/** El motivo faltante lo explica el servidor; el resto usa el mensaje accionable. */
function withdrawalMessage(error: ApiError): string {
  const details = error.details as { reason?: unknown } | null;
  const reason = Array.isArray(details?.reason) ? details?.reason[0] : details?.reason;
  return typeof reason === 'string' && reason ? reason : error.userMessage;
}
