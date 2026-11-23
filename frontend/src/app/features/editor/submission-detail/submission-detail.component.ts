import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiError } from '../../../core/models/api-error.model';
import {
  Assignment,
  EligibleReviewer,
  SubmissionDetail,
  SubmissionVersion,
  VerdictRegistered,
} from '../../../core/models/editor.model';
import { EditorService } from '../../../core/services/editor.service';
import { ManuscriptService } from '../../../core/services/manuscript.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog.component';
import { ErrorStateComponent } from '../../../shared/components/error-state.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner.component';
import { RoundCounterComponent } from '../../../shared/components/round-counter.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { FileSizePipe } from '../../../shared/pipes/file-size.pipe';
import { saveBlob } from '../../../shared/utils/save-blob';
import { AssignReviewerDialogComponent } from '../assign-reviewer-dialog/assign-reviewer-dialog.component';
import { ReviewerPickerComponent } from '../reviewer-picker/reviewer-picker.component';
import { VerdictFormComponent } from '../verdict-form/verdict-form.component';
import {
  RevocationRequest,
  RevokeAssignmentDialogComponent,
} from '../revoke-assignment-dialog/revoke-assignment-dialog.component';

/** Fechas y horas se muestran en la zona institucional (UTC-5, sin horario de verano). */
const INSTITUTIONAL_OFFSET = '-0500';

/**
 * Detalle editorial de un envío (plan sección 3.5, HU-10).
 *
 * * Metadatos completos, autores con su contacto y filiación, cada
 *   versión con el sello de integridad de su PDF, e historial.
 * * El PDF exacto se descarga con `Blob` desde el endpoint autorizado;
 *   el servidor audita cada descarga y la interfaz nunca ve rutas del
 *   volumen.
 * * «Pasar a revisión» solo aparece para un envío `SUBMITTED` activo, pide
 *   confirmación y, al terminar, vuelve a leer el detalle: el estado que
 *   se muestra es siempre el del servidor, también si otro Editor se
 *   adelantó (`409`).
 * * En revisión, la sección «Revisor» permite asignar (selector de
 *   elegibles y confirmación con la fecha límite del servidor) o revocar
 *   (causa y motivo). Tras cada acción se vuelve a leer el detalle, y un
 *   `409` (otro Editor actuó antes) se explica y deja ver el estado real.
 * * Con el envío en revisión o ya juzgado, la sección «Evaluación y
 *   veredicto» muestra la evaluación final, los veredictos registrados
 *   (solo lectura) y, si corresponde, el formulario para registrar el
 *   veredicto con el `ETag` del detalle.
 * * La ruta exige el rol `EDITOR`; el backend vuelve a validarlo y deja
 *   fuera los manuscritos con conflicto de interés (`404`). No hay datos
 *   de auditoría global ni acciones de Administrador.
 */
@Component({
  selector: 'app-submission-detail',
  imports: [
    DatePipe,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorStateComponent,
    StatusBadgeComponent,
    RoundCounterComponent,
    ConfirmDialogComponent,
    FileSizePipe,
    ReviewerPickerComponent,
    AssignReviewerDialogComponent,
    RevokeAssignmentDialogComponent,
    VerdictFormComponent,
  ],
  templateUrl: './submission-detail.component.html',
  styleUrl: './submission-detail.component.scss',
})
export class SubmissionDetailComponent {
  private readonly editor = inject(EditorService);
  private readonly manuscripts = inject(ManuscriptService);
  private readonly route = inject(ActivatedRoute);

  protected readonly offset = INSTITUTIONAL_OFFSET;
  protected readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly submission = signal<SubmissionDetail | null>(null);
  /** `ETag` del detalle: el veredicto lo envía en `If-Match`. */
  protected readonly etag = signal<string | null>(null);

  /** Estados en los que hay evaluación o veredicto que mostrar. */
  protected readonly judgeable: readonly string[] = [
    'UNDER_REVIEW',
    'REQUIRES_CORRECTIONS',
    'ACCEPTED',
    'REJECTED',
  ];

  protected readonly dialogOpen = signal(false);
  protected readonly starting = signal(false);
  protected readonly startError = signal('');
  protected readonly notice = signal('');

  protected readonly pickerOpen = signal(false);
  protected readonly chosenReviewer = signal<EligibleReviewer | null>(null);
  protected readonly assignDialogOpen = signal(false);
  protected readonly assigning = signal(false);
  protected readonly assignError = signal('');
  /** Resultado de la asignación: trae la fecha límite fijada por el servidor. */
  protected readonly assigned = signal<Assignment | null>(null);

  protected readonly revokeOpen = signal(false);
  protected readonly revoking = signal(false);
  protected readonly revokeError = signal('');

  protected readonly downloading = signal<string | null>(null);
  protected readonly downloadError = signal('');

  protected readonly canStartReview = computed(() => {
    const current = this.submission();
    return current !== null && current.is_active && current.status === 'SUBMITTED';
  });

  protected readonly confirmMessage = computed(
    () =>
      `El envío ${this.submission()?.code ?? ''} pasará a «En revisión» y dejará de aparecer ` +
      'en la bandeja de nuevos envíos. Después podrá asignar al Revisor.',
  );

  constructor() {
    this.load();
  }

  /** Lee el detalle; `silent` conserva la pantalla mientras se actualiza. */
  protected load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
    }
    this.error.set(null);
    this.editor.getSubmission(this.id).subscribe({
      next: ({ submission, etag }) => {
        this.submission.set(submission);
        this.etag.set(etag);
        this.loading.set(false);
      },
      error: (error: ApiError) => {
        // Una actualización fallida no borra lo que ya se estaba mostrando.
        if (!silent || this.submission() === null) {
          this.error.set(error);
        }
        this.loading.set(false);
      },
    });
  }

  protected confirmStart(): void {
    this.dialogOpen.set(false);
    if (this.starting()) {
      return;
    }
    this.starting.set(true);
    this.startError.set('');
    this.notice.set('');
    this.editor.startReview(this.id).subscribe({
      next: () => {
        this.starting.set(false);
        this.notice.set('El envío pasó a revisión.');
        this.load(true);
      },
      error: (error: ApiError) => {
        this.starting.set(false);
        this.startError.set(error.userMessage);
        // Si otro Editor se adelantó, se muestra el estado real.
        this.load(true);
      },
    });
  }

  /** Informa del efecto del veredicto y vuelve a leer el detalle (estado y `ETag` nuevos). */
  protected verdictRegistered({ result }: VerdictRegistered): void {
    this.startError.set('');
    const corrected = result.verdict.previous_verdict !== null;
    const effect =
      result.verdict.decision === 'ACCEPTED'
        ? 'el artículo se publicó en el catálogo.'
        : result.verdict.decision === 'REJECTED'
          ? 'el manuscrito fue rechazado.'
          : result.opened_round !== null
            ? `se abrió la ronda ${result.opened_round} para que el Autor envíe una nueva versión.`
            : 'el manuscrito requiere correcciones.';
    this.notice.set(
      corrected
        ? `Decisión corregida registrada (la anterior se conserva en el historial): ${effect}`
        : `Veredicto registrado: ${effect}`,
    );
    this.load(true);
  }

  protected chooseReviewer(reviewer: EligibleReviewer): void {
    this.chosenReviewer.set(reviewer);
    this.assignError.set('');
    this.assigned.set(null);
    this.assignDialogOpen.set(true);
  }

  protected closeAssignDialog(): void {
    this.assignDialogOpen.set(false);
    this.assignError.set('');
  }

  protected confirmAssign(): void {
    const reviewer = this.chosenReviewer();
    if (reviewer === null || this.assigning()) {
      return;
    }
    this.assigning.set(true);
    this.assignError.set('');
    this.editor.assignReviewer(this.id, reviewer.id).subscribe({
      next: (assignment) => {
        this.assigning.set(false);
        // El diálogo muestra la fecha límite que fijó el servidor.
        this.assigned.set(assignment);
      },
      error: (error: ApiError) => {
        this.assigning.set(false);
        this.assignError.set(error.userMessage);
        // Un 409 (otro Editor asignó antes) se explica y se muestra el estado real.
        this.load(true);
      },
    });
  }

  /** Cierra el resultado de la asignación y vuelve a leer el detalle. */
  protected finishAssign(): void {
    this.assignDialogOpen.set(false);
    this.pickerOpen.set(false);
    this.chosenReviewer.set(null);
    this.assigned.set(null);
    this.notice.set('Revisor asignado.');
    this.load(true);
  }

  protected closeRevokeDialog(): void {
    this.revokeOpen.set(false);
    this.revokeError.set('');
  }

  protected confirmRevoke(request: RevocationRequest): void {
    const assignment = this.submission()?.open_assignment;
    if (!assignment || this.revoking()) {
      return;
    }
    this.revoking.set(true);
    this.revokeError.set('');
    this.editor.revokeAssignment(assignment.id, request.cause, request.reason).subscribe({
      next: () => {
        this.revoking.set(false);
        this.revokeOpen.set(false);
        this.notice.set('Asignación revocada. El manuscrito espera un nuevo Revisor.');
        this.load(true);
      },
      error: (error: ApiError) => {
        this.revoking.set(false);
        this.revokeError.set(error.userMessage);
        this.load(true);
      },
    });
  }

  /** Descarga el PDF exacto de la versión; el servidor audita cada descarga. */
  protected download(submission: SubmissionDetail, version: SubmissionVersion): void {
    if (this.downloading() !== null) {
      return;
    }
    this.downloading.set(version.id);
    this.downloadError.set('');
    this.manuscripts
      .downloadVersion(submission.id, version.id, `${submission.code}-v${version.version_number}.pdf`)
      .subscribe({
        next: ({ blob, filename }) => {
          saveBlob(blob, filename);
          this.downloading.set(null);
        },
        error: (error: ApiError) => {
          this.downloadError.set(error.userMessage);
          this.downloading.set(null);
        },
      });
  }
}
